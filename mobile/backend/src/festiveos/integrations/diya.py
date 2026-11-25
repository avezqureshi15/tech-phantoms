"""The web support platform ("Diya", ``web/server``): where a request for a call back is sent.

Server to server only. Every request is signed with a shared secret (HMAC-SHA256 over the time and
the exact body), so the web server can tell it came from here and cannot be replayed later.

What is sent is the least that lets someone call a person back: a name, a number they chose to
give, their language, what it is about, and a record of their consent. No email, no group or
festival data, no messages. If this is not configured the feature is simply off; it can never
take the app down.
"""

import hashlib
import hmac
import json
import logging
import time
from typing import Any

import requests

from festiveos.config import diya_base_url, diya_secret
from festiveos.core.errors import ServiceUnavailableError

LOGGER = logging.getLogger("festiveos.diya")
PATH = "/api/integrations/support-requests"
TIMEOUT_SECONDS = 8.0
UNAVAILABLE = "We couldn't reach support just now. Please try again in a little while."


def sign(secret: str, timestamp: str, body: bytes) -> str:
    """The signature the web server checks: HMAC-SHA256 of ``<timestamp>.<body>``, in hex."""
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


class DiyaClient:
    def __init__(
        self,
        *,
        base_url: str | None = None,
        secret: str | None = None,
        session: requests.Session | None = None,
        clock: Any = time.time,
    ) -> None:
        self._base = (base_url or diya_base_url()).rstrip("/")
        self._secret = secret or diya_secret()
        self._session = session or requests.Session()
        self._clock = clock

    def create_support_request(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Send one request and return the web server's answer. Repeating it is safe: the web server
        recognises the same ``requestId`` and does not create a second query."""
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode()
        timestamp = str(int(self._clock()))
        headers = {
            "Content-Type": "application/json",
            "X-Festiveos-Timestamp": timestamp,
            "X-Festiveos-Signature": sign(self._secret, timestamp, body),
        }
        try:
            response = self._session.post(
                f"{self._base}{PATH}", data=body, headers=headers, timeout=TIMEOUT_SECONDS
            )
        except requests.RequestException as exc:
            LOGGER.error(
                "support platform unreachable", extra={"fields": {"error": type(exc).__name__}}
            )
            raise ServiceUnavailableError(UNAVAILABLE) from exc
        if not response.ok:
            # Only the status: an error body can echo what was sent, including the phone number.
            LOGGER.error(
                "support platform refused", extra={"fields": {"status": response.status_code}}
            )
            raise ServiceUnavailableError(UNAVAILABLE)
        try:
            answer = response.json()
        except ValueError as exc:
            raise ServiceUnavailableError(UNAVAILABLE) from exc
        return answer if isinstance(answer, dict) else {}


def get_diya() -> DiyaClient | None:
    """None unless the address and the secret are both set. A function so tests can override it."""
    return DiyaClient() if diya_base_url() and diya_secret() else None
