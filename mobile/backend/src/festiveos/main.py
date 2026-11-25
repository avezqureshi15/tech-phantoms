from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from festiveos.accounts.router import features_router
from festiveos.accounts.router import router as accounts_router
from festiveos.ai.router import router as ai_router
from festiveos.audio.router import router as audio_router
from festiveos.auth.router import router as auth_router
from festiveos.config import api_docs_enabled, get_settings
from festiveos.core import limits
from festiveos.core.errors import ERROR_STATUS, RateLimitedError
from festiveos.core.guards import BodySizeLimitMiddleware, GlobalRateLimitMiddleware
from festiveos.core.log import (
    HTTP_LOGGER,
    RequestContextMiddleware,
    configure_logging,
    request_ctx_var,
)
from festiveos.core.ratelimit import too_many_requests
from festiveos.db.dependencies import SessionDep
from festiveos.db.session import engine
from festiveos.expenses.router import router as expenses_router
from festiveos.festivals.router import router as festivals_router
from festiveos.households.router import router as households_router
from festiveos.inventory.router import router as inventory_router
from festiveos.panchang.router import router as panchang_router
from festiveos.search.router import router as search_router
from festiveos.support.router import router as support_router
from festiveos.traditions.router import router as traditions_router

API_PREFIX = "/api/v1"
ROUTERS = (
    auth_router,
    accounts_router,
    features_router,
    households_router,
    festivals_router,
    expenses_router,
    inventory_router,
    traditions_router,
    ai_router,
    panchang_router,
    search_router,
    audio_router,
    support_router,
)

# SQLSTATEs that mean "the database was busy, try again" rather than "something is broken":
# deadlock detected, lock_timeout hit, serialization failure, statement_timeout hit.
RETRYABLE_SQLSTATES = frozenset({"40P01", "55P03", "40001", "57014"})


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    configure_logging()
    get_settings()  # fail fast on missing JWT_SECRET / GOOGLE_CLIENT_IDS
    yield
    engine.dispose()


def _register_error_handler(app: FastAPI, exc_type: type[Exception], status_code: int) -> None:
    headers = {"WWW-Authenticate": "Bearer"} if status_code == 401 else None

    @app.exception_handler(exc_type)
    async def handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=status_code, content={"detail": str(exc)}, headers=headers)


async def database_busy_handler(_: Request, exc: DBAPIError) -> JSONResponse:
    sqlstate = getattr(exc.orig, "sqlstate", None)
    if sqlstate not in RETRYABLE_SQLSTATES:
        raise exc  # a real bug: the middleware logs it and answers with a generic 500

    HTTP_LOGGER.warning(
        "database busy, asking the client to retry", extra={"fields": {"sqlstate": sqlstate}}
    )
    ctx = request_ctx_var.get()
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The service is busy. Please try again.",
            "request_id": ctx.request_id if ctx else None,
        },
        headers={"Retry-After": "1"},
    )


def create_app(enable_docs: bool | None = None) -> FastAPI:
    docs = api_docs_enabled() if enable_docs is None else enable_docs
    app = FastAPI(
        title="FestiveOS",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )

    # Outermost last: the request id and log line wrap everything, then the cheap rejections
    # (rate limit, body size) run before routing, parsing and the database.
    app.add_middleware(BodySizeLimitMiddleware)
    app.add_middleware(GlobalRateLimitMiddleware)
    app.add_middleware(RequestContextMiddleware)

    for router in ROUTERS:
        app.include_router(router, prefix=API_PREFIX)

    for exc_type, status_code in ERROR_STATUS.items():
        _register_error_handler(app, exc_type, status_code)
    app.add_exception_handler(DBAPIError, database_busy_handler)
    app.add_exception_handler(RateLimitedError, lambda _, exc: too_many_requests(exc))

    health_limit = [Depends(limits.health)]

    @app.get("/health/live", dependencies=health_limit)
    def live() -> dict[str, str]:
        """Is the process up? Touches nothing else, so a load balancer can poll it freely."""
        return {"status": "ok"}

    @app.get("/health/ready", dependencies=health_limit)
    @app.get("/health", dependencies=health_limit)
    def ready(session: SessionDep) -> dict[str, str]:
        """Can it serve traffic? Includes the database."""
        session.execute(text("SELECT 1"))
        return {"status": "ok", "database": "up"}

    return app


app = create_app()
