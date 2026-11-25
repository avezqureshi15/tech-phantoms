"""Feature flags (Flagsmith).

Flags let a feature be switched off, or a setting changed, without a release: a costly feature
misbehaving, an AI model that needs swapping, a staged rollout. Three rules keep this safe:

* **The code holds the defaults.** If Flagsmith is not configured, slow, down or returns something
  odd, every flag takes the value written here and the app carries on exactly as before. A flag
  service must never be able to take the app down.
* **Only an opaque user id leaves the server.** No email, name, faith or anything else about a
  person is sent to the flag service; targeting uses the id alone.
* **Flags are enforced on the server.** The app is told what is on (``GET /features``) so it can
  hide things, but hiding a button is courtesy: the routes themselves refuse when a feature is off.
"""

import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

from flagsmith import Flagsmith
from flagsmith.models import DefaultFlag

from festiveos.config import flagsmith_server_key, get_settings
from festiveos.core.errors import ServiceUnavailableError

LOGGER = logging.getLogger("festiveos.flags")

# Feature name -> whether it is on when nothing says otherwise. Create a flag with the same name in
# Flagsmith to control it; a name that is not listed here is always off.
DEFAULTS: dict[str, bool] = {
    "utsav": True,  # the AI assistant at all (chat, voice, documents)
    "utsav_voice": True,  # talking to Utsav and hearing it speak
    "elder_mode": True,  # the voice-only screen for elders
    "recite_mode": True,  # practising a prayer with corrections
    "event_search": True,  # live web search for events (the costly part of finding events)
    "receipt_scan": True,  # reading a receipt into an expense
    "document_upload": True,  # attaching documents to a chat with Utsav
    "support_callback": True,  # asking the support team to phone you back
}
FEATURE_NAMES = {
    "utsav": "Utsav",
    "utsav_voice": "Voice",
    "elder_mode": "Elder mode",
    "recite_mode": "Recite practice",
    "event_search": "Event search",
    "receipt_scan": "Receipt scanning",
    "document_upload": "Documents",
    "support_callback": "Call-back support",
}


def feature_off(name: str) -> ServiceUnavailableError:
    """The 503 for a feature that is switched off. Kind about it, and says nothing about why."""
    label = FEATURE_NAMES.get(name, "This feature")
    return ServiceUnavailableError(f"{label} is switched off for now. Please try again later.")


# Remote settings (a flag's value, not just on/off). None means "use the server's own setting".
VALUE_NAMES = ("ai_model", "ai_effort", "announcement", "tts_voice")
EFFORTS = frozenset({"low", "medium", "high", "xhigh", "max"})
MAX_VALUE_CHARS = 280
REFRESH_SECONDS = 60
CACHE_SECONDS = 30  # a person's flags are remembered this long: a change shows within half a minute
CACHE_SIZE = 2_048
FAILURE_LOG_EVERY = 300  # one line per five minutes however often flags fail, never a flood

Evaluate = Callable[[str | None], Any]


@dataclass(frozen=True)
class Evaluated:
    """The flags as one person (or the environment as a whole) sees them."""

    features: dict[str, bool]
    values: dict[str, str | None]

    def enabled(self, name: str) -> bool:
        return self.features.get(name, False)

    def value(self, name: str) -> str | None:
        return self.values.get(name)


def _defaults() -> Evaluated:
    return Evaluated(dict(DEFAULTS), dict.fromkeys(VALUE_NAMES))


def _text(value: object) -> str | None:
    """A flag value as safe text: non-empty, plain and short."""
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())[:MAX_VALUE_CHARS]
    return cleaned or None


class FeatureFlags:
    def __init__(self, client: Flagsmith | None = None) -> None:
        self._client = client
        self._last_failure = 0.0
        self._cache: dict[str | None, tuple[float, Evaluated]] = {}

    def _evaluate(self, user_id: str | None) -> Evaluated:
        if self._client is None:
            return _defaults()
        now = time.monotonic()
        cached = self._cache.get(user_id)
        if cached and now - cached[0] < CACHE_SECONDS:
            return cached[1]
        evaluated = self._ask(user_id)
        if len(self._cache) >= CACHE_SIZE:
            self._cache.clear()  # simple and bounded: a cold cache costs one lookup per person
        self._cache[user_id] = (now, evaluated)
        return evaluated

    def _ask(self, user_id: str | None) -> Evaluated:
        try:
            flags = (
                self._client.get_identity_flags(
                    user_id
                )  # the id alone: no traits, no personal data
                if user_id
                else self._client.get_environment_flags()
            )
            features = {
                name: bool(flags.is_feature_enabled(name)) if _known(flags, name) else default
                for name, default in DEFAULTS.items()
            }
            values = {
                name: _text(flags.get_feature_value(name)) if _known(flags, name) else None
                for name in VALUE_NAMES
            }
            return Evaluated(features, values)
        except Exception as exc:
            self._note_failure(exc)
            return _defaults()

    def _note_failure(self, exc: Exception) -> None:
        now = time.monotonic()
        if now - self._last_failure >= FAILURE_LOG_EVERY:
            self._last_failure = now
            LOGGER.warning(
                "feature flags unavailable, using defaults",
                extra={"fields": {"error": type(exc).__name__}},
            )

    def for_user(self, user_id: str | None) -> Evaluated:
        return self._evaluate(user_id)

    def environment(self) -> Evaluated:
        return self._evaluate(None)

    def enabled(self, name: str, user_id: str | None = None) -> bool:
        return self._evaluate(user_id).enabled(name)

    # ---- remote settings, validated: a bad value is ignored, never trusted -----------------
    def ai_model(self) -> str | None:
        value = self.environment().value("ai_model")
        return value if value and len(value) <= 60 and " " not in value else None

    def tts_voice(self) -> str | None:
        """The speaking voice, if one is set in Flagsmith. Checked against the real list by the
        speech client, so a typo here changes nothing."""
        value = self.environment().value("tts_voice")
        return value.lower() if value and value.isalpha() and len(value) <= 20 else None

    def ai_effort(self) -> str | None:
        value = self.environment().value("ai_effort")
        return value if value in EFFORTS else None


def _known(flags: Any, name: str) -> bool:
    """Whether this flag exists in Flagsmith (a flag that was never created keeps its default)."""
    try:
        return not flags.get_flag(name).is_default
    except Exception:
        return False


class _OneLine(logging.Filter):
    """The SDK logs a full stack trace every time it cannot reach Flagsmith (every minute with a
    revoked key). Replace that with one short line, at most once every few minutes."""

    def __init__(self) -> None:
        super().__init__()
        self._last = 0.0

    def filter(self, record: logging.LogRecord) -> bool:
        if record.levelno < logging.WARNING:
            return True
        now = time.monotonic()
        if now - self._last < FAILURE_LOG_EVERY:
            return False
        self._last = now
        record.exc_info = record.exc_text = None
        record.args = ()
        record.msg = "flagsmith could not be reached or refused the key; flags use their defaults"
        return True


def _default_handler(name: str) -> DefaultFlag:
    return DefaultFlag(enabled=DEFAULTS.get(name, False), value=None)


def build_flags() -> FeatureFlags:
    key = flagsmith_server_key()
    if not key:
        return FeatureFlags(None)
    # A server-side key (ser.…) lets the SDK download the rules and evaluate locally: no network
    # call per request. Any other key evaluates remotely, with a short timeout.
    local = key.startswith("ser.")
    sdk_logger = logging.getLogger("flagsmith")
    if not any(isinstance(f, _OneLine) for f in sdk_logger.filters):
        sdk_logger.addFilter(_OneLine())
    client = Flagsmith(
        environment_key=key,
        api_url=get_settings().flagsmith_api_url,
        enable_local_evaluation=local,
        environment_refresh_interval_seconds=REFRESH_SECONDS,
        request_timeout_seconds=3,
        default_flag_handler=_default_handler,
    )
    return FeatureFlags(client)


@lru_cache
def _shared() -> FeatureFlags:
    return build_flags()


def get_feature_flags() -> FeatureFlags:
    """One client per process. A function so tests can override it."""
    return _shared()
