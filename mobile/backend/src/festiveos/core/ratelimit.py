"""Rate limiting.

Algorithm: a sliding-window counter. Usage is estimated as the previous fixed window's count,
weighted by how much of it still overlaps the sliding window, plus the current window's count.
That is accurate to within a request or two, needs two integers per key, and does not allow the
double burst at a window boundary that a plain fixed window does.

Backends:
* ``MemoryRateLimiter`` - in process. Sharded locks, bounded memory. Limits are per process.
* ``RedisRateLimiter`` - shared by every process and instance, so the limit is exact across a
  fleet. If Redis is unreachable it falls back to a local limiter instead of failing the request.

Only requests that are allowed are counted; a rejected request never extends a client's wait.
"""

import hashlib
import ipaddress
import logging
import math
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Literal, Protocol

import redis
from fastapi import Depends, Request, Response
from fastapi.responses import JSONResponse

from festiveos.config import get_settings
from festiveos.core.errors import RateLimitedError
from festiveos.core.log import request_ctx_var
from festiveos.core.security import decode_access_token

LOGGER = logging.getLogger("festiveos.ratelimit")


@dataclass(frozen=True)
class Limit:
    name: str
    requests: int
    window_seconds: int


@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int  # whole seconds to wait; 0 when allowed
    reset_after: int  # whole seconds until the current window ends


class RateLimiter(Protocol):
    def hit(self, key: str, limit: Limit) -> Decision: ...

    def reset(self) -> None: ...


# --------------------------------------------------------------------------- the algorithm


def decide(previous: int, current: int, limit: Limit, elapsed: float) -> Decision:
    """Decide one request. ``previous``/``current`` are the counts before it; ``elapsed`` is how
    far into the current window we are, in seconds."""
    window = limit.window_seconds
    carried = previous * (1 - elapsed / window)
    usage_with_this = carried + current + 1
    reset_after = max(1, math.ceil(window - elapsed))

    if usage_with_this <= limit.requests:
        remaining = max(0, math.floor(limit.requests - usage_with_this))
        return Decision(True, limit.requests, remaining, 0, reset_after)
    return Decision(
        False,
        limit.requests,
        0,
        retry_after_seconds(previous, current, limit, elapsed),
        reset_after,
    )


def retry_after_seconds(previous: int, current: int, limit: Limit, elapsed: float) -> int:
    """The smallest whole number of seconds after which the same request would be allowed,
    assuming nothing else is counted in between."""
    window = limit.window_seconds
    allowed_carry = limit.requests - 1 - current  # what the previous window may still contribute

    if allowed_carry >= 0 and previous > 0:
        # Still inside this window: wait until the previous window's weight has decayed enough.
        needed_fraction = 1 - allowed_carry / previous
        wait = (needed_fraction - elapsed / window) * window
        return max(1, math.ceil(wait))

    # This window is already full: wait for the next one, whose "previous" is our current count.
    until_next = window - elapsed
    if current <= 0:
        return max(1, math.ceil(until_next))
    needed_fraction = max(0.0, 1 - (limit.requests - 1) / current)
    return max(1, math.ceil(until_next + needed_fraction * window))


# ------------------------------------------------------------------------- in-process backend


@dataclass
class _Counter:
    window: int
    current: int = 0
    previous: int = 0


class MemoryRateLimiter:
    """Thread-safe, sharded, with a hard cap on tracked keys so a flood of distinct keys cannot
    exhaust memory (the least recently used key is forgotten first)."""

    def __init__(
        self,
        clock: Callable[[], float] = time.time,
        max_keys: int = 100_000,
        shards: int = 16,
    ) -> None:
        self._clock = clock
        self._per_shard = max(1, max_keys // shards)
        self._shards: list[tuple[threading.Lock, OrderedDict[str, _Counter]]] = [
            (threading.Lock(), OrderedDict()) for _ in range(shards)
        ]

    def hit(self, key: str, limit: Limit) -> Decision:
        now = self._clock()
        window_index = int(now // limit.window_seconds)
        elapsed = now - window_index * limit.window_seconds
        lock, counters = self._shards[hash((limit.name, key)) % len(self._shards)]
        slot = f"{limit.name}\x00{key}"

        with lock:
            counter = counters.get(slot)
            if counter is None:
                counter = counters[slot] = _Counter(window=window_index)
            elif counter.window == window_index - 1:
                counter.previous, counter.current, counter.window = counter.current, 0, window_index
            elif counter.window != window_index:
                counter.previous, counter.current, counter.window = 0, 0, window_index
            counters.move_to_end(slot)

            decision = decide(counter.previous, counter.current, limit, elapsed)
            if decision.allowed:
                counter.current += 1
            while len(counters) > self._per_shard:
                counters.popitem(last=False)
        return decision

    def reset(self) -> None:
        for lock, counters in self._shards:
            with lock:
                counters.clear()

    def tracked_keys(self) -> int:
        return sum(len(counters) for _, counters in self._shards)


# ----------------------------------------------------------------------------- shared backend


class RedisRateLimiter:
    """Counters in Redis, so every process agrees. Never makes a request fail because Redis did:
    on an error it falls back to ``fallback`` and stays off Redis for ``cooldown`` seconds, so
    a dead Redis costs one timeout, not one per request."""

    def __init__(
        self,
        client: "redis.Redis",
        fallback: RateLimiter,
        *,
        prefix: str = "festiveos:rl",
        clock: Callable[[], float] = time.time,
        cooldown: float = 5.0,
    ) -> None:
        self._client = client
        self._fallback = fallback
        self._prefix = prefix
        self._clock = clock
        self._cooldown = cooldown
        self._down_until = 0.0

    def hit(self, key: str, limit: Limit) -> Decision:
        now = self._clock()
        if now < self._down_until:
            return self._fallback.hit(key, limit)

        window_index = int(now // limit.window_seconds)
        elapsed = now - window_index * limit.window_seconds
        current_key = f"{self._prefix}:{limit.name}:{key}:{window_index}"
        previous_key = f"{self._prefix}:{limit.name}:{key}:{window_index - 1}"
        try:
            pipeline = self._client.pipeline(transaction=True)
            pipeline.incr(current_key)
            pipeline.get(previous_key)
            pipeline.expire(current_key, 2 * limit.window_seconds)
            current_after, previous_raw, _ = pipeline.execute()
            decision = decide(int(previous_raw or 0), int(current_after) - 1, limit, elapsed)
            if not decision.allowed:
                self._client.decr(current_key)  # a rejected request is not counted
            return decision
        except redis.RedisError:
            self._down_until = now + self._cooldown
            LOGGER.warning(
                "rate limit store unavailable, limiting locally for %ss",
                self._cooldown,
                extra={"fields": {"backend": "redis"}},
            )
            return self._fallback.hit(key, limit)

    def reset(self) -> None:
        self._fallback.reset()
        cursor = 0
        while True:
            cursor, keys = self._client.scan(cursor, match=f"{self._prefix}:*", count=500)
            if keys:
                self._client.delete(*keys)
            if cursor == 0:
                break


@lru_cache
def build_rate_limiter() -> RateLimiter:
    settings = get_settings()
    local = MemoryRateLimiter()
    if not settings.rate_limit_redis_url:
        return local
    client = redis.Redis.from_url(
        settings.rate_limit_redis_url,
        socket_timeout=0.1,  # the limiter must never be the slow part of a request
        socket_connect_timeout=0.2,
        health_check_interval=30,
    )
    return RedisRateLimiter(client, fallback=local)


def get_rate_limiter() -> RateLimiter:
    """FastAPI dependency; tests override it."""
    return build_rate_limiter()


LimiterDep = Annotated[RateLimiter, Depends(get_rate_limiter)]


# ------------------------------------------------------------------------------ who is calling


def _normalise_ip(value: str) -> str | None:
    try:
        address = ipaddress.ip_address(value.strip())
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address):
        if address.ipv4_mapped:
            return str(address.ipv4_mapped)
        # A customer often holds a whole /64; rotating inside it must not reset a limit.
        return str(ipaddress.ip_network(f"{address}/64", strict=False).network_address) + "/64"
    return str(address)


def client_ip(request: Request, trusted_proxies: int) -> str:
    """The caller's address. ``X-Forwarded-For`` is only believed for the proxies we run
    (``trusted_proxies``); anything a client put further left in the header is ignored."""
    peer = request.client.host if request.client else "unknown"
    if trusted_proxies > 0:
        hops = [h for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
        if len(hops) >= trusted_proxies:
            forwarded = _normalise_ip(hops[-trusted_proxies])
            if forwarded:
                return forwarded
    return _normalise_ip(peer) or peer


def _subject(request: Request) -> str | None:
    """The user id from a *valid* bearer token, without touching the database."""
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    try:
        return str(decode_access_token(header[7:].strip()).user_id)
    except Exception:
        return None


def _digest(value: str) -> str:
    """Counters hold a hash, never a raw address or id, in memory, Redis keys or logs."""
    return hashlib.sha256(value.encode()).hexdigest()[:20]


def identify(request: Request, scope: Literal["user", "ip"]) -> tuple[str, str]:
    """(kind, digest) of who to charge. User-scoped limits fall back to the IP for callers with
    no valid token, which is also what stops floods of junk tokens."""
    if scope == "user":
        subject = _subject(request)
        if subject:
            return "user", _digest(subject)
    return "ip", _digest(client_ip(request, get_settings().trusted_proxy_count))


# ------------------------------------------------------------------------ HTTP integration


def rate_limit_headers(decision: Decision) -> dict[str, str]:
    headers = {
        "X-RateLimit-Limit": str(decision.limit),
        "X-RateLimit-Remaining": str(decision.remaining),
        "X-RateLimit-Reset": str(decision.reset_after),
    }
    if not decision.allowed:
        headers["Retry-After"] = str(decision.retry_after)
    return headers


def enforce(
    limiter: RateLimiter, request: Request, limit: Limit, scope: Literal["user", "ip"]
) -> Decision | None:
    """Charge the caller for one request. Returns the decision (None when limiting is off);
    raises ``RateLimitedError`` when the limit is exceeded."""
    if not get_settings().rate_limit_enabled:
        return None
    kind, digest = identify(request, scope)
    decision = limiter.hit(f"{kind}:{digest}", limit)
    if not decision.allowed:
        raise RateLimitedError(limit.name, kind, decision.retry_after, limit.requests, digest[:8])
    return decision


def rate_limited(limit: Limit, *, scope: Literal["user", "ip"] = "user") -> Callable[..., None]:
    """A route dependency that applies ``limit`` before any other work on the route."""

    def dependency(request: Request, response: Response, limiter: LimiterDep) -> None:
        decision = enforce(limiter, request, limit, scope)
        if decision is not None:
            response.headers.update(rate_limit_headers(decision))

    dependency.rate_limit = limit  # type: ignore[attr-defined]  # lets a test prove every route has one
    return dependency


def too_many_requests(exc: RateLimitedError) -> JSONResponse:
    LOGGER.warning(
        "rate limited",
        extra={
            "fields": {
                "policy": exc.policy,
                "scope": exc.scope,
                "caller": exc.key_hint,  # a short hash: enough to correlate, not to identify
                "retry_after": exc.retry_after,
            }
        },
    )
    ctx = request_ctx_var.get()
    return JSONResponse(
        status_code=429,
        content={"detail": str(exc), "request_id": ctx.request_id if ctx else None},
        headers={
            "Retry-After": str(exc.retry_after),
            "X-RateLimit-Limit": str(exc.limit),
            "X-RateLimit-Remaining": "0",
        },
    )
