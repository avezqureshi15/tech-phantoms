"""Incidents (NudgeBee).

When a paid provider keeps failing, or the AI is used far more than normal, the backend tells a
NudgeBee workflow. NudgeBee asks a person whether to switch the feature off and, on approval, turns
the matching Flagsmith flag off; the routes then refuse the feature (see ``integrations/flags.py``).
The payload is the contract in ``mobile/DEPLOY-AWS-NUDGEBEE.md``. Four rules keep this safe:

* **Never in the way of a request.** Counting is in memory; the webhook is sent on a background
  thread with a short timeout. A NudgeBee outage costs one log line, never a slow or failed request.
* **No personal data.** Only the feature, the reason and counts leave the server: no user ids,
  names, messages or provider responses.
* **No flood.** At most one incident per feature and reason per window, however many failures.
* **Nothing is decided here.** This only asks; a person approves in NudgeBee, Flagsmith applies it.

Counts are per process. With several replicas each counts its own traffic, so a threshold is
reached a little later; that is fine for a signal whose answer is a human decision.
"""

import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any
from urllib.parse import urlsplit

import requests

from festiveos.config import nudgebee_environment, nudgebee_webhook_url

LOGGER = logging.getLogger("festiveos.nudgebee")

WINDOW_MINUTES = 10
SEND_TIMEOUT = 4.0
FAILURE_LOG_EVERY = 300  # one line per five minutes however often NudgeBee fails


@dataclass(frozen=True)
class Reason:
    threshold: int  # events within the window that raise an incident
    summary: str  # what happened, for the notification; formatted with count and window
    action: str  # what the person is asked to approve


REASONS: dict[str, Reason] = {
    "sarvam_credits_exhausted": Reason(
        1,
        "Sarvam reports exhausted credits ({count} failures in {window} minutes).",
        "Switch off {feature} in Flagsmith",
    ),
    "sarvam_errors": Reason(
        5,
        "Sarvam requests are failing ({count} failures in {window} minutes).",
        "Switch off {feature} in Flagsmith",
    ),
    "ai_provider_errors": Reason(
        5,
        "The AI provider is failing ({count} failures in {window} minutes).",
        "Switch off {feature} in Flagsmith",
    ),
    "ai_usage_spike": Reason(
        300,
        "AI model calls are far above normal ({count} in {window} minutes).",
        "Switch off {feature} in Flagsmith, or set ai_model to a cheaper model",
    ),
}
FEATURE_LABELS = {
    "utsav": "Utsav",
    "utsav_voice": "Voice",
    "receipt_scan": "Receipt scanning",
    "document_upload": "Documents",
}

Submit = Callable[[Callable[[], None]], Any]


class IncidentReporter:
    def __init__(
        self,
        webhook_url: str | None,
        *,
        environment: str = "production",
        session: requests.Session | None = None,
        submit: Submit | None = None,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._url = webhook_url or None
        self._environment = environment
        self._session = session or requests.Session()
        self._submit = submit or _background().submit
        self._clock, self._now = clock, now
        self._lock = threading.Lock()
        self._events: dict[tuple[str, str], deque[float]] = {}
        self._reported: dict[tuple[str, str], float] = {}
        self._last_failure = float("-inf")

    @property
    def enabled(self) -> bool:
        return self._url is not None

    def record(self, feature: str, reason: str) -> None:
        """Count one event; send an incident if this one crosses the reason's threshold."""
        if self._url is None or feature not in FEATURE_LABELS or reason not in REASONS:
            return
        window = WINDOW_MINUTES * 60
        key = (feature, reason)
        with self._lock:
            now = self._clock()
            events = self._events.setdefault(key, deque())
            events.append(now)
            while events and now - events[0] > window:
                events.popleft()
            count = len(events)
            last = self._reported.get(key)
            if count < REASONS[reason].threshold or (last is not None and now - last < window):
                return
            self._reported[key] = now
        payload = self._payload(feature, reason, count)
        self._submit(lambda: self._send(payload))

    def _payload(self, feature: str, reason: str, count: int) -> dict[str, Any]:
        spec = REASONS[reason]
        return {
            "event": "FEATURE_INCIDENT",
            "environment": self._environment,
            "feature": feature,
            "reason": reason,
            "summary": f"{FEATURE_LABELS[feature]}: "
            + spec.summary.format(count=count, window=WINDOW_MINUTES),
            "suggested_action": spec.action.format(feature=feature),
            "count": count,
            "window_minutes": WINDOW_MINUTES,
            "occurred_at": self._now().isoformat(timespec="seconds").replace("+00:00", "Z"),
        }

    def _send(self, payload: dict[str, Any]) -> None:
        try:
            response = self._session.post(self._url, json=payload, timeout=SEND_TIMEOUT)
        except requests.RequestException as exc:
            self._note_failure(type(exc).__name__, None)
            return
        if not response.ok:
            self._note_failure("HTTPError", response.status_code)
            return
        LOGGER.info(
            "incident reported",
            extra={"fields": {"feature": payload["feature"], "reason": payload["reason"]}},
        )

    def _note_failure(self, error: str, status: int | None) -> None:
        # Never the URL: it is the credential that starts the workflow.
        now = self._clock()
        if now - self._last_failure >= FAILURE_LOG_EVERY:
            self._last_failure = now
            LOGGER.warning(
                "nudgebee could not be reached; incident not reported",
                extra={"fields": {"error": error, "status": status}},
            )


@lru_cache
def _background() -> ThreadPoolExecutor:
    # One worker: incidents are rare (one per feature and reason per window) and order is kept.
    return ThreadPoolExecutor(max_workers=1, thread_name_prefix="nudgebee")


def _usable(url: str) -> bool:
    """Only https, so the workflow trigger never crosses the network in clear text."""
    parts = urlsplit(url)
    return parts.scheme == "https" and bool(parts.netloc)


def build_incidents() -> IncidentReporter:
    url = nudgebee_webhook_url()
    if url and not _usable(url):
        LOGGER.warning("NUDGEBEE_WEBHOOK_URL is not an https URL; incidents are not reported")
        url = ""
    return IncidentReporter(url or None, environment=nudgebee_environment())


@lru_cache
def get_incidents() -> IncidentReporter:
    """One reporter per process, so counts and de-duplication are shared by every request."""
    return build_incidents()
