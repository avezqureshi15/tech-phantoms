"""The limiter itself: algorithm, both backends, concurrency, bounded memory and Redis failure."""

import logging
import random
import threading
import uuid

import pytest
import redis
from starlette.requests import Request

from festiveos.core.ratelimit import (
    Limit,
    MemoryRateLimiter,
    RateLimiter,
    RedisRateLimiter,
    client_ip,
    decide,
    identify,
)
from festiveos.core.security import create_access_token

pytestmark = pytest.mark.filterwarnings("ignore::ResourceWarning")


class Clock:
    def __init__(self, now: float = 1_000_000.0) -> None:
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture(params=["memory", "redis"])
def limiter(request: pytest.FixtureRequest, clock: Clock) -> RateLimiter:
    if request.param == "memory":
        return MemoryRateLimiter(clock=clock)
    client = request.getfixturevalue("redis_client")
    return RedisRateLimiter(
        client, MemoryRateLimiter(clock=clock), prefix=f"test:{uuid.uuid4().hex}", clock=clock
    )


# --------------------------------------------------------------------------- the algorithm


def test_requests_are_allowed_up_to_the_limit_then_rejected(limiter: RateLimiter) -> None:
    limit = Limit("t", 5, 60)

    decisions = [limiter.hit("k", limit) for _ in range(7)]

    assert [d.allowed for d in decisions] == [True] * 5 + [False] * 2
    assert [d.remaining for d in decisions[:5]] == [4, 3, 2, 1, 0]
    assert decisions[5].retry_after >= 1
    assert all(d.limit == 5 for d in decisions)


def test_the_window_slides_so_a_boundary_cannot_be_used_for_a_double_burst(
    limiter: RateLimiter, clock: Clock
) -> None:
    limit = Limit("t", 10, 60)
    clock.now = 60 * 5000 + 59  # the last second of a window
    assert all(limiter.hit("k", limit).allowed for _ in range(10))

    clock.advance(2)  # now two seconds into the next window

    # A plain fixed window would allow 10 more here (a burst of 20 in 3 seconds).
    assert not limiter.hit("k", limit).allowed


def test_old_usage_decays_away(limiter: RateLimiter, clock: Clock) -> None:
    limit = Limit("t", 10, 60)
    clock.now = 60 * 5000
    for _ in range(10):
        limiter.hit("k", limit)

    clock.advance(60 * 2)  # two full windows later nothing is carried over

    assert limiter.hit("k", limit).remaining == 9


def test_keys_and_policies_do_not_share_counters(limiter: RateLimiter) -> None:
    small, other = Limit("small", 1, 60), Limit("other", 1, 60)

    assert limiter.hit("a", small).allowed
    assert not limiter.hit("a", small).allowed
    assert limiter.hit("b", small).allowed  # a different caller
    assert limiter.hit("a", other).allowed  # a different policy


@pytest.mark.parametrize(
    "limit", [Limit("a", 1, 5), Limit("b", 5, 10), Limit("c", 30, 60), Limit("d", 100, 3600)]
)
def test_waiting_exactly_the_advertised_retry_after_always_succeeds(
    limiter: RateLimiter, clock: Clock, limit: Limit
) -> None:
    rng = random.Random(limit.requests * 7919 + limit.window_seconds)  # noqa: S311
    clock.now = limit.window_seconds * 7000 + rng.random() * limit.window_seconds
    denials = 0

    for step in range(max(300, 5 * limit.requests)):
        decision = limiter.hit(f"k{step % 2}", limit)
        if decision.allowed:
            # about four times the allowed rate, so every scenario really does hit the limit
            clock.advance(rng.random() * limit.window_seconds * 0.5 / limit.requests)
            continue
        denials += 1
        key = f"k{step % 2}"
        clock.advance(decision.retry_after)
        assert limiter.hit(key, limit).allowed, (
            f"still rejected after {decision.retry_after}s (step {step})"
        )

    assert denials > 0  # the scenario really did exercise rejection


def test_a_rejected_request_does_not_extend_the_wait(limiter: RateLimiter, clock: Clock) -> None:
    limit = Limit("t", 2, 30)
    clock.now = 30 * 9000
    limiter.hit("k", limit)
    limiter.hit("k", limit)
    advised = limiter.hit("k", limit).retry_after

    for _ in range(100):  # an impatient client keeps hammering
        limiter.hit("k", limit)

    assert limiter.hit("k", limit).retry_after == advised


def test_decide_matches_hand_worked_cases() -> None:
    limit = Limit("t", 10, 60)

    assert decide(0, 0, limit, 0).allowed
    assert decide(0, 0, limit, 0).remaining == 9
    # half of a previous window of 10 still counts: 5 + 4 + this one = 10, exactly at the limit
    assert decide(10, 4, limit, 30).allowed
    assert not decide(10, 5, limit, 30).allowed
    full = decide(0, 10, limit, 15)
    # 45s to the next window, then 6s more for this window's 10 to decay enough to fit one more
    assert (full.allowed, full.retry_after) == (False, 51)
    assert decide(0, 0, Limit("t", 1, 1), 0.0).reset_after == 1


# ------------------------------------------------------------------------------ concurrency


def test_concurrent_callers_never_exceed_the_limit(limiter: RateLimiter) -> None:
    limit = Limit("t", 100, 3600)
    allowed = []
    guard = threading.Lock()

    def worker() -> None:
        mine = sum(limiter.hit("shared", limit).allowed for _ in range(50))
        with guard:
            allowed.append(mine)

    threads = [threading.Thread(target=worker) for _ in range(16)]  # 800 attempts
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sum(allowed) == 100


# --------------------------------------------------------------------- bounded memory (memory)


def test_a_flood_of_distinct_keys_cannot_grow_memory_without_bound(clock: Clock) -> None:
    limiter = MemoryRateLimiter(clock=clock, max_keys=1600, shards=16)
    limit = Limit("t", 1, 60)

    for i in range(20_000):  # an attacker rotating through addresses
        limiter.hit(f"attacker-{i}", limit)

    assert limiter.tracked_keys() <= 1600
    # a recent key is still tracked and still limited
    assert limiter.hit("attacker-19999", limit).allowed is False


def test_reset_forgets_everything(clock: Clock) -> None:
    limiter = MemoryRateLimiter(clock=clock)
    limiter.hit("k", Limit("t", 1, 60))

    limiter.reset()

    assert limiter.hit("k", Limit("t", 1, 60)).allowed


# ----------------------------------------------------------------------------- redis specific


def test_two_processes_share_one_limit_through_redis(
    redis_client: "redis.Redis", clock: Clock
) -> None:
    prefix = f"test:{uuid.uuid4().hex}"
    first = RedisRateLimiter(
        redis_client, MemoryRateLimiter(clock=clock), prefix=prefix, clock=clock
    )
    second = RedisRateLimiter(
        redis.Redis.from_url(redis_client.connection_pool.connection_kwargs and _url(redis_client)),
        MemoryRateLimiter(clock=clock),
        prefix=prefix,
        clock=clock,
    )
    limit = Limit("t", 6, 3600)

    results = [first.hit("k", limit).allowed for _ in range(4)] + [
        second.hit("k", limit).allowed for _ in range(4)
    ]

    assert results.count(True) == 6  # not 6 per process
    assert not first.hit("k", limit).allowed
    assert not second.hit("k", limit).allowed


def _url(client: "redis.Redis") -> str:
    kwargs = client.connection_pool.connection_kwargs
    return f"redis://{kwargs['host']}:{kwargs['port']}/{kwargs.get('db', 0)}"


def test_redis_counters_expire_on_their_own(redis_client: "redis.Redis", clock: Clock) -> None:
    prefix = f"test:{uuid.uuid4().hex}"
    limiter = RedisRateLimiter(
        redis_client, MemoryRateLimiter(clock=clock), prefix=prefix, clock=clock
    )

    limiter.hit("k", Limit("t", 5, 60))

    ttls = [redis_client.ttl(key) for key in redis_client.scan_iter(f"{prefix}:*")]
    assert ttls
    assert all(0 < ttl <= 120 for ttl in ttls)  # two windows, then gone: nothing accumulates


def test_redis_keys_hold_no_raw_identifiers(redis_client: "redis.Redis", clock: Clock) -> None:
    from festiveos.core.ratelimit import _digest

    limiter = RedisRateLimiter(
        redis_client, MemoryRateLimiter(clock=clock), prefix="test:x", clock=clock
    )
    limiter.hit(f"ip:{_digest('203.0.113.9')}", Limit("t", 5, 60))

    keys = b" ".join(redis_client.scan_iter("test:x:*")).decode()
    assert "203.0.113.9" not in keys


class DeadRedis:
    """A client whose every call fails, counting how often it is asked."""

    def __init__(self) -> None:
        self.calls = 0

    def pipeline(self, *_: object, **__: object) -> "DeadRedis":
        self.calls += 1
        raise redis.ConnectionError("connection refused")


def test_a_dead_redis_falls_back_to_local_limits_and_is_not_retried_every_request(
    clock: Clock, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="festiveos")
    dead = DeadRedis()
    limiter = RedisRateLimiter(dead, MemoryRateLimiter(clock=clock), clock=clock, cooldown=5.0)  # type: ignore[arg-type]
    limit = Limit("t", 3, 60)

    decisions = [limiter.hit("k", limit) for _ in range(20)]

    assert [d.allowed for d in decisions].count(True) == 3  # still protected, locally
    assert dead.calls == 1  # one failure opened the circuit; the other 19 never touched Redis
    assert len([r for r in caplog.records if "unavailable" in r.getMessage()]) == 1

    clock.advance(6)  # the cooldown passes, so Redis is tried again
    limiter.hit("other", limit)
    assert dead.calls == 2


def test_redis_reset_clears_only_its_own_keys(redis_client: "redis.Redis", clock: Clock) -> None:
    redis_client.set("unrelated", "keep")
    limiter = RedisRateLimiter(
        redis_client, MemoryRateLimiter(clock=clock), prefix="test:reset", clock=clock
    )
    limiter.hit("k", Limit("t", 1, 60))

    limiter.reset()

    assert limiter.hit("k", Limit("t", 1, 60)).allowed
    assert redis_client.get("unrelated") == b"keep"


# --------------------------------------------------------------------------- who is calling


def request_from(
    peer: str | None, forwarded: str | None = None, token: str | None = None
) -> Request:
    headers = []
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    if token is not None:
        headers.append((b"authorization", f"Bearer {token}".encode()))
    return Request(
        {
            "type": "http",
            "headers": headers,
            "client": (peer, 5000) if peer else None,
            "method": "GET",
            "path": "/",
        }
    )


def test_a_forwarded_header_is_ignored_when_no_proxy_is_trusted() -> None:
    request = request_from("198.51.100.7", "203.0.113.1, 10.0.0.1")

    assert (
        client_ip(request, trusted_proxies=0) == "198.51.100.7"
    )  # nothing a client sends can change this


def test_the_trusted_proxy_count_picks_the_hop_our_own_proxy_appended() -> None:
    forged = "1.1.1.1, 2.2.2.2"  # what a client sent
    one_proxy = request_from("10.0.0.1", f"{forged}, 203.0.113.9")
    two_proxies = request_from("10.0.0.1", f"{forged}, 203.0.113.9, 10.9.9.9")

    assert client_ip(one_proxy, 1) == "203.0.113.9"
    assert client_ip(two_proxies, 2) == "203.0.113.9"


@pytest.mark.parametrize(
    ("forwarded", "proxies"),
    [
        (None, 1),  # no header at all
        ("", 1),
        ("not-an-ip", 1),  # a garbage hop
        ("203.0.113.9", 2),  # shorter than the number of proxies we run: cannot be trusted
    ],
)
def test_a_missing_short_or_garbage_header_falls_back_to_the_connection(
    forwarded: str | None, proxies: int
) -> None:
    assert client_ip(request_from("10.0.0.1", forwarded), proxies) == "10.0.0.1"


def test_ipv6_callers_are_grouped_by_their_64_so_rotating_addresses_does_not_help() -> None:
    first = client_ip(request_from("2001:db8:abcd:12:1111:2222:3333:4444"), 0)
    second = client_ip(request_from("2001:db8:abcd:12:aaaa:bbbb:cccc:dddd"), 0)
    other = client_ip(request_from("2001:db8:abcd:13::1"), 0)

    assert first == second == "2001:db8:abcd:12::/64"
    assert other != first


def test_ipv4_mapped_ipv6_is_treated_as_the_ipv4_address() -> None:
    assert client_ip(request_from("::ffff:203.0.113.5"), 0) == "203.0.113.5"


def test_a_caller_without_an_address_still_gets_a_bucket() -> None:
    assert client_ip(request_from(None), 0) == "unknown"


def test_user_scoped_limits_charge_the_user_and_fall_back_to_the_ip() -> None:
    user_id, session_id = uuid.uuid4(), uuid.uuid4()
    token = create_access_token(user_id, session_id)

    with_token = identify(request_from("10.0.0.1", token=token), "user")
    other_ip_same_user = identify(request_from("10.0.0.2", token=token), "user")
    junk = identify(request_from("10.0.0.1", token="not-a-jwt"), "user")
    anonymous = identify(request_from("10.0.0.1"), "user")
    ip_scoped = identify(request_from("10.0.0.1", token=token), "ip")

    assert with_token[0] == "user"
    assert with_token == other_ip_same_user  # the same person on a new network is the same bucket
    assert junk == anonymous == ip_scoped
    assert junk[0] == "ip"  # junk tokens are charged to the address that sent them
