"""ASGI middleware that rejects abusive requests before any routing, parsing or database work."""

import json
import re
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import Request
from starlette.concurrency import run_in_threadpool

from festiveos.config import get_settings
from festiveos.core.errors import RateLimitedError
from festiveos.core.limits import GLOBAL_PER_IP
from festiveos.core.log import request_ctx_var
from festiveos.core.ratelimit import (
    MemoryRateLimiter,
    RateLimiter,
    enforce,
    get_rate_limiter,
    too_many_requests,
)

Scope = dict[str, Any]
Receive = Callable[[], Awaitable[dict]]
Send = Callable[[dict], Awaitable[None]]


class GlobalRateLimitMiddleware:
    """One generous per-IP ceiling over everything, a backstop for routes without their own."""

    def __init__(self, app: Callable[..., Awaitable[None]]) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not get_settings().rate_limit_enabled:
            await self.app(scope, receive, send)
            return

        overrides = getattr(scope.get("app"), "dependency_overrides", {})
        limiter: RateLimiter = overrides.get(get_rate_limiter, get_rate_limiter)()
        request = Request(scope)
        try:
            if isinstance(limiter, MemoryRateLimiter):
                enforce(limiter, request, GLOBAL_PER_IP, "ip")  # microseconds: fine inline
            else:
                # A network call must never run on the event loop.
                await run_in_threadpool(enforce, limiter, request, GLOBAL_PER_IP, "ip")
        except RateLimitedError as exc:
            await too_many_requests(exc)(scope, receive, send)
            return
        await self.app(scope, receive, send)


# Routes that take a file. Everything else keeps the small JSON limit.
UPLOAD_PATH = re.compile(r"/(expenses/scan|ai/documents|ai/transcribe)$")
MULTIPART_OVERHEAD = 65_536  # boundaries and form fields around the file itself


def body_limit(path: str) -> int:
    settings = get_settings()
    if UPLOAD_PATH.search(path):
        return settings.max_upload_bytes + MULTIPART_OVERHEAD
    return settings.max_request_bytes


class RequestTooLargeError(BaseException):
    """Deliberately not an ``Exception``: FastAPI's body parsing catches those and would answer
    400. This passes straight through it to the middleware, which answers 413."""


class BodySizeLimitMiddleware:
    """Refuses oversized bodies: by Content-Length up front, and by counting streamed bytes."""

    def __init__(self, app: Callable[..., Awaitable[None]]) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = body_limit(scope.get("path", ""))
        declared = dict(scope["headers"]).get(b"content-length", b"").decode("latin-1")
        if declared.isdigit() and int(declared) > limit:
            await self._reject(scope, receive, send)
            return

        received = 0
        response_started = False

        async def counting_receive() -> dict:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise RequestTooLargeError
            return message

        async def tracking_send(message: dict) -> None:
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except RequestTooLargeError:
            if not response_started:
                await self._reject(scope, receive, send)

    @staticmethod
    async def _reject(scope: Scope, receive: Receive, send: Send) -> None:
        ctx = request_ctx_var.get()
        body = json.dumps(
            {"detail": "Request body too large", "request_id": ctx.request_id if ctx else None}
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"connection", b"close"),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
