"""Logging: structured output, request context, and an aspect woven over the services.

* ``configure_logging`` - JSON (default) or text lines on stdout, LOG_LEVEL / LOG_FORMAT.
* ``RequestContextMiddleware`` - request id, response headers, one access log line per request.
* ``@logged`` / ``@logged_service`` - the aspect: wraps calls to log outcome and duration so
  services stay free of logging code. Only identifiers and numbers are ever logged; strings are
  replaced with ``<str>`` because they may hold tokens, emails or other personal data.
"""

import enum
import functools
import inspect
import json
import logging
import os
import re
import sys
import time
import uuid
from collections.abc import Callable
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel

from festiveos.core.errors import (
    ConflictError,
    ForbiddenError,
    InvalidInputError,
    NotFoundError,
    ServiceUnavailableError,
    UnauthorizedError,
)

SERVICE_LOGGER = logging.getLogger("festiveos.service")
HTTP_LOGGER = logging.getLogger("festiveos.http")

EXPECTED_ERRORS = (
    NotFoundError,
    ConflictError,
    ForbiddenError,
    UnauthorizedError,
    InvalidInputError,
    ServiceUnavailableError,
)
SECURITY_ERRORS = (ForbiddenError, UnauthorizedError)  # worth a WARNING: someone was refused

_REQUEST_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")


@dataclass
class RequestContext:
    """Mutable on purpose: dependencies run in worker threads and share this one object."""

    request_id: str
    user_id: str | None = None


request_ctx_var: ContextVar[RequestContext | None] = ContextVar("request_ctx", default=None)


def set_request_user(user_id: uuid.UUID) -> None:
    ctx = request_ctx_var.get()
    if ctx is not None:
        ctx.user_id = str(user_id)


def utc_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


# --------------------------------------------------------------------------- formatting


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ctx = request_ctx_var.get()
        payload: dict[str, Any] = {
            "ts": utc_timestamp(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": ctx.request_id if ctx else None,
            "user_id": ctx.user_id if ctx else None,
        }
        payload.update(getattr(record, "fields", {}))
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        ctx = request_ctx_var.get()
        fields = " ".join(f"{k}={v}" for k, v in getattr(record, "fields", {}).items())
        rid = f" [{ctx.request_id[:8]}]" if ctx else ""
        line = f"{record.levelname:<7}{rid} {record.name}: {record.getMessage()} {fields}".rstrip()
        return line + ("\n" + self.formatException(record.exc_info) if record.exc_info else "")


def configure_logging() -> None:
    """Idempotent; called once at startup."""
    root = logging.getLogger()
    root.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())
    for handler in list(root.handlers):
        if getattr(handler, "_festiveos", False):
            root.removeHandler(handler)
    handler = logging.StreamHandler(sys.stdout)
    handler._festiveos = True  # type: ignore[attr-defined]
    use_text = os.getenv("LOG_FORMAT", "json").lower() == "text"
    handler.setFormatter(TextFormatter() if use_text else JsonFormatter())
    root.addHandler(handler)


# --------------------------------------------------------------------------- the aspect


def _describe(value: object) -> object:
    """A loggable summary of an argument: identifiers and numbers only."""
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, enum.Enum):
        return value.value if isinstance(value.value, bool | int | float | str) else value.name
    if isinstance(value, str | bytes):
        return "<str>"  # may be a token, an email or free text
    if isinstance(value, BaseModel):
        return f"<{type(value).__name__}>"
    identifier = getattr(value, "id", None)
    if isinstance(identifier, uuid.UUID):
        return f"{type(value).__name__}:{identifier}"
    if isinstance(value, list | tuple | set | dict):
        return f"<{type(value).__name__} of {len(value)}>"
    return f"<{type(value).__name__}>"


def _describe_args(signature: inspect.Signature, args: tuple, kwargs: dict) -> dict[str, object]:
    try:
        bound = signature.bind_partial(*args, **kwargs)
    except TypeError:
        return {}
    return {
        name: _describe(value)
        for name, value in bound.arguments.items()
        if name not in {"self", "cls"}
    }


def logged(func: Callable[..., Any]) -> Callable[..., Any]:
    """Aspect: record outcome, duration and safe arguments of a call."""
    signature = inspect.signature(func)
    call = func.__qualname__

    @functools.wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        started = time.perf_counter()

        def fields(outcome: str, **extra: Any) -> dict[str, Any]:
            return {
                "call": call,
                "outcome": outcome,
                "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                "args": _describe_args(signature, args, kwargs),
                **extra,
            }

        try:
            result = func(*args, **kwargs)
        except EXPECTED_ERRORS as exc:
            level = logging.WARNING if isinstance(exc, SECURITY_ERRORS) else logging.INFO
            SERVICE_LOGGER.log(
                level,
                "%s rejected",
                call,
                extra={"fields": fields("rejected", error=type(exc).__name__)},
            )
            raise
        except Exception as exc:
            SERVICE_LOGGER.exception(
                "%s failed", call, extra={"fields": fields("error", error=type(exc).__name__)}
            )
            raise
        SERVICE_LOGGER.info("%s ok", call, extra={"fields": fields("ok")})
        return result

    return wrapper


def logged_service[T](cls: type[T]) -> type[T]:
    """Weave the aspect over every public method of a service class."""
    for name, attribute in list(vars(cls).items()):
        if not name.startswith("_") and inspect.isfunction(attribute):
            setattr(cls, name, logged(attribute))
    return cls


# --------------------------------------------------------------------------- HTTP middleware


def route_template(path: str, path_params: dict[str, Any]) -> str:
    """/households/3f2... -> /households/{household_id}: low-cardinality, free of identifiers."""
    by_value = {str(value): name for name, value in path_params.items()}
    return "/".join(
        f"{{{by_value[segment]}}}" if segment in by_value else segment
        for segment in path.split("/")
    )


class RequestContextMiddleware:
    """Pure ASGI: assigns a request id, stamps response headers, logs each request once."""

    def __init__(self, app: Callable[..., Any]) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Callable, send: Callable) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        inbound = dict(scope["headers"]).get(b"x-request-id", b"").decode("latin-1")
        request_id = inbound if _REQUEST_ID.fullmatch(inbound) else uuid.uuid4().hex
        ctx = RequestContext(request_id=request_id)
        token = request_ctx_var.set(ctx)
        started = time.perf_counter()
        status = 500
        response_started = False

        def stamp(headers: list[tuple[bytes, bytes]]) -> list[tuple[bytes, bytes]]:
            return [
                *headers,
                (b"x-request-id", request_id.encode()),
                (b"x-server-time", utc_timestamp().encode()),
                # An API of personal data: never cache it, never let a browser sniff its type.
                (b"cache-control", b"no-store"),
                (b"x-content-type-options", b"nosniff"),
            ]

        async def send_wrapper(message: dict) -> None:
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
                message = {**message, "headers": stamp(list(message.get("headers", [])))}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception:
            HTTP_LOGGER.exception("unhandled error")
            if not response_started:
                body = json.dumps(
                    {"detail": "Internal server error", "request_id": request_id}
                ).encode()
                headers = stamp(
                    [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                    ]
                )
                await send({"type": "http.response.start", "status": 500, "headers": headers})
                await send({"type": "http.response.body", "body": body})
        finally:
            HTTP_LOGGER.info(
                "request",
                extra={
                    "fields": {
                        "method": scope["method"],
                        "path": route_template(scope["path"], scope.get("path_params", {})),
                        "status": status,
                        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                        "user_id": ctx.user_id,
                    }
                },
            )
            request_ctx_var.reset(token)
