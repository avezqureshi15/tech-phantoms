"""Fixtures. Plain helpers live in tests/support.py.

Set TEST_DATABASE_URL to run against real Postgres: the real migrations are applied (down to
base, then up to head) and every table is truncated between tests. Otherwise the suite uses an
in-memory SQLite schema built from the models.
"""

import os
from collections.abc import Callable, Iterator
from pathlib import Path

# Settings are read lazily, but set before any application import to be safe.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
TEST_REDIS_URL = os.environ.get("TEST_REDIS_URL")
os.environ["DATABASE_URL"] = TEST_DATABASE_URL or "postgresql+psycopg://test:test@localhost/test"
os.environ["JWT_SECRET"] = "t" * 48
os.environ["GOOGLE_CLIENT_IDS"] = "test-client-id"
os.environ["DB_LOCK_TIMEOUT_MS"] = "1000"

import pytest
import redis
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from festiveos.auth.models import AuthSession
from festiveos.config import get_settings
from festiveos.core.ratelimit import build_rate_limiter
from festiveos.db import registry  # noqa: F401  (registers every model)
from festiveos.db.base import Base
from festiveos.db.session import get_session
from festiveos.integrations.google import GoogleVerifier, get_google_verifier
from festiveos.main import app
from festiveos.users.models import User
from tests.support import fake_google_verifier

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


@pytest.fixture(autouse=True)
def fresh_rate_limits() -> Iterator[None]:
    """Every test starts with empty counters, so tests cannot exhaust each other's limits."""
    build_rate_limiter.cache_clear()
    yield
    build_rate_limiter.cache_clear()


@pytest.fixture(scope="session")
def migrated_postgres() -> Iterator[Engine | None]:
    if not TEST_DATABASE_URL:
        yield None
        return
    engine = create_engine(TEST_DATABASE_URL)

    @event.listens_for(engine, "connect")
    def detect_deadlocks_quickly(dbapi_connection, _):
        # Postgres waits 1s before checking for a deadlock; tests should not. (Superuser-only.)
        try:
            dbapi_connection.execute("SET deadlock_timeout = '100ms'")
            dbapi_connection.commit()
        except Exception:
            dbapi_connection.rollback()

    command.downgrade(Config(str(ALEMBIC_INI)), "base")
    command.upgrade(Config(str(ALEMBIC_INI)), "head")
    yield engine
    engine.dispose()


@pytest.fixture
def engine(migrated_postgres: Engine | None) -> Iterator[Engine]:
    if migrated_postgres is not None:
        yield migrated_postgres
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        with migrated_postgres.begin() as connection:
            connection.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        return

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture
def client(session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    def override_verifier() -> GoogleVerifier:
        return fake_google_verifier

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_google_verifier] = override_verifier
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def make_user(session_factory: sessionmaker[Session]) -> Callable[[str], User]:
    def _make(email: str) -> User:
        with session_factory() as session:
            user = User(name=email.split("@")[0], email=email)
            session.add(user)
            session.flush()
            login = AuthSession(user_id=user.id)
            session.add(login)
            session.commit()
            user.test_session_id = login.id  # type: ignore[attr-defined]
            return user

    return _make


@pytest.fixture
def settings_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[Callable[..., None]]:
    """Change environment settings for one test: ``settings_env(TRUSTED_PROXY_COUNT="1")``."""

    def apply(**env: str) -> None:
        for name, value in env.items():
            monkeypatch.setenv(name, value)
        get_settings.cache_clear()
        build_rate_limiter.cache_clear()

    yield apply
    monkeypatch.undo()
    get_settings.cache_clear()
    build_rate_limiter.cache_clear()


@pytest.fixture
def redis_client() -> Iterator["redis.Redis"]:
    """A client for the throwaway Redis in TEST_REDIS_URL; tests are skipped without one."""
    if not TEST_REDIS_URL:
        pytest.skip("set TEST_REDIS_URL to run against a real Redis")
    client = redis.Redis.from_url(TEST_REDIS_URL, socket_timeout=1)
    client.flushdb()
    yield client
    client.flushdb()
    client.close()
