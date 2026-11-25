import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv
from sqlalchemy.engine import make_url

load_dotenv()

LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})
# libpq modes that always encrypt. "prefer"/"allow" silently fall back to plaintext.
SAFE_SSL_MODES = frozenset({"require", "verify-ca", "verify-full"})


def get_database_url() -> str:
    """The configured database URL, with TLS enforced for anything that is not local."""
    raw = os.getenv("DATABASE_URL")
    if not raw:
        raise RuntimeError("DATABASE_URL is not set")
    return _enforce_tls(raw)


def _enforce_tls(raw: str) -> str:
    url = make_url(raw)
    if url.host is None or url.host in LOCAL_HOSTS:
        return raw  # unix socket or developer machine

    mode = url.query.get("sslmode")
    if mode is None:
        return url.update_query_dict({"sslmode": "require"}).render_as_string(hide_password=False)
    if mode not in SAFE_SSL_MODES:
        raise RuntimeError(
            f"DATABASE_URL must use TLS for remote hosts (got sslmode={mode}); "
            f"use one of: {', '.join(sorted(SAFE_SSL_MODES))}"
        )
    return raw


def api_docs_enabled() -> bool:
    """Swagger/ReDoc/OpenAPI are off unless ENABLE_API_DOCS is explicitly turned on."""
    return os.getenv("ENABLE_API_DOCS", "").strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    jwt_secret: str
    google_client_ids: tuple[str, ...]
    jwt_issuer: str = "festiveos"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    # A request never waits forever on a lock, a slow query, or an abandoned transaction.
    db_lock_timeout_ms: int = 5_000
    db_statement_timeout_ms: int = 30_000
    db_idle_in_transaction_timeout_ms: int = 60_000
    rate_limit_enabled: bool = True
    rate_limit_redis_url: str | None = None  # a secret when it carries a password: never log it
    trusted_proxy_count: int = 0
    max_request_bytes: int = 262_144
    max_upload_bytes: int = 10_485_760  # a receipt photo or a PDF; applies to upload routes only
    # Feature flags. Empty means Flagsmith Cloud. Set it to point at a self-hosted Flagsmith.
    flagsmith_api_url: str | None = None
    # Utsav, the AI layer. Off unless an OpenAI key is set. The key is read straight from the
    # environment by the client and is never copied into settings where it could be logged.
    # gpt-6.2-sol: OpenAI's go-to model for agents at scale; $2 in / $10 out per 1M tokens.
    ai_model: str = "gpt-6.2-sol"
    ai_effort: str = "medium"
    ai_max_tokens: int = 16_000
    ai_timeout_seconds: int = 120
    ai_max_iterations: int = 8  # model calls allowed in one turn
    ai_max_messages: int = 80  # per conversation; a longer chat should start a new one
    # A turn holds a worker thread for the whole model call; cap them so AI traffic can never
    # starve the rest of the API.
    ai_max_concurrent_turns: int = 8


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        raise RuntimeError(f"{name} must be a whole number of milliseconds") from None
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


def _non_negative_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        raise RuntimeError(f"{name} must be a whole number") from None
    if value < 0:
        raise RuntimeError(f"{name} must not be negative")
    return value


AI_EFFORTS = ("low", "medium", "high", "xhigh", "max")


def _choice(name: str, default: str, allowed: tuple[str, ...]) -> str:
    value = (os.getenv(name) or default).strip()
    if value not in allowed:
        raise RuntimeError(f"{name} must be one of: {', '.join(allowed)}")
    return value


def _choice_or_text(name: str, default: str) -> str:
    return (os.getenv(name) or default).strip()


def openai_api_key() -> str:
    """The OpenAI key, or an empty string. OPENAI_API_KEY is the standard name; OPEN_AI_API_KEY is
    accepted too because that is what this project's .env has always used."""
    return (os.getenv("OPENAI_API_KEY") or os.getenv("OPEN_AI_API_KEY") or "").strip()


def flagsmith_server_key() -> str:
    """The Flagsmith environment key, or an empty string (flags then use their defaults)."""
    return (os.getenv("FLAGSMITH_SERVER_KEY") or "").strip()


def diya_base_url() -> str:
    """Where the web support platform (``web/server``) lives, e.g. ``https://support.example.com``."""
    return (os.getenv("DIYA_BASE_URL") or "").strip().rstrip("/")


def diya_secret() -> str:
    """The shared secret both servers sign support requests with. Never logged or sent."""
    return (os.getenv("DIYA_INTEGRATION_SECRET") or "").strip()


def sarvam_voice() -> str | None:
    """The speaking voice from ``SARVAM_VOICE`` (blank means the built-in default)."""
    return (os.getenv("SARVAM_VOICE") or "").strip().lower() or None


def sarvam_api_key() -> str:
    """The Sarvam key (translation and document reading), or an empty string."""
    return (os.getenv("SARVAM_API_KEY") or "").strip()


def ai_enabled() -> bool:
    """Utsav needs an OpenAI key; without one the AI routes answer 503."""
    return bool(openai_api_key())


def _flag(name: str, *, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"{name} must be true or false")


@lru_cache
def get_settings() -> Settings:
    secret = os.getenv("JWT_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("JWT_SECRET must be set to at least 32 characters")

    client_ids = tuple(
        value.strip() for value in os.getenv("GOOGLE_CLIENT_IDS", "").split(",") if value.strip()
    )
    if not client_ids:
        raise RuntimeError("GOOGLE_CLIENT_IDS must list at least one OAuth client ID")

    return Settings(
        jwt_secret=secret,
        google_client_ids=client_ids,
        db_lock_timeout_ms=_positive_int("DB_LOCK_TIMEOUT_MS", 5_000),
        db_statement_timeout_ms=_positive_int("DB_STATEMENT_TIMEOUT_MS", 30_000),
        db_idle_in_transaction_timeout_ms=_positive_int(
            "DB_IDLE_IN_TRANSACTION_TIMEOUT_MS", 60_000
        ),
        rate_limit_enabled=_flag("RATE_LIMIT_ENABLED", default=True),
        rate_limit_redis_url=(os.getenv("RATE_LIMIT_REDIS_URL") or "").strip() or None,
        trusted_proxy_count=_non_negative_int("TRUSTED_PROXY_COUNT", 0),
        max_request_bytes=_positive_int("MAX_REQUEST_BYTES", 262_144),
        max_upload_bytes=_positive_int("MAX_UPLOAD_BYTES", 10_485_760),
        flagsmith_api_url=(os.getenv("FLAGSMITH_API_URL") or "").strip() or None,
        ai_model=_choice_or_text("AI_MODEL", "gpt-6.2-sol"),
        ai_effort=_choice("AI_EFFORT", "medium", AI_EFFORTS),
        ai_max_tokens=_positive_int("AI_MAX_TOKENS", 16_000),
        ai_timeout_seconds=_positive_int("AI_TIMEOUT_SECONDS", 120),
        ai_max_iterations=_positive_int("AI_MAX_ITERATIONS", 8),
        ai_max_messages=_positive_int("AI_MAX_MESSAGES", 80),
        ai_max_concurrent_turns=_positive_int("AI_MAX_CONCURRENT_TURNS", 8),
    )
