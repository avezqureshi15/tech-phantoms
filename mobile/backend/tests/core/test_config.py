import pytest
from sqlalchemy.pool import QueuePool

from festiveos.config import get_database_url

REMOTE = "postgresql+psycopg://postgres:p%40ss@db.example.supabase.co:5432/postgres"


def url_for(monkeypatch: pytest.MonkeyPatch, value: str) -> str:
    monkeypatch.setenv("DATABASE_URL", value)
    return get_database_url()


def test_remote_database_without_sslmode_is_forced_to_require(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert "sslmode=require" in url_for(monkeypatch, REMOTE)


def test_password_encoding_survives_the_rewrite(monkeypatch: pytest.MonkeyPatch) -> None:
    assert ":p%40ss@" in url_for(monkeypatch, REMOTE)


@pytest.mark.parametrize("weak", ["disable", "allow", "prefer"])
def test_remote_database_refuses_weak_sslmode(monkeypatch: pytest.MonkeyPatch, weak: str) -> None:
    with pytest.raises(RuntimeError, match="TLS"):
        url_for(monkeypatch, f"{REMOTE}?sslmode={weak}")


@pytest.mark.parametrize("strong", ["require", "verify-ca", "verify-full"])
def test_remote_database_accepts_strong_sslmode_unchanged(
    monkeypatch: pytest.MonkeyPatch, strong: str
) -> None:
    assert f"sslmode={strong}" in url_for(monkeypatch, f"{REMOTE}?sslmode={strong}")


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "[::1]"])
def test_local_databases_may_skip_tls(monkeypatch: pytest.MonkeyPatch, host: str) -> None:
    value = f"postgresql+psycopg://postgres@{host}:5432/dev"
    assert url_for(monkeypatch, value) == value


def test_missing_url_fails_fast(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr("festiveos.config.load_dotenv", lambda *a, **k: None, raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        get_database_url()


def test_engine_uses_sqlalchemys_default_pool_sizes() -> None:
    from festiveos.db.session import engine

    assert isinstance(engine.pool, QueuePool)
    assert engine.pool.size() == 5  # SQLAlchemy default; overflow default is 10
