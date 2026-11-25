"""Sarvam AI: translation between Indian languages and reading documents (OCR). The only module that
talks to it.

Documents are the person's own (receipts, bills, letters), so nothing about their content is logged:
only the kind of call, the status and the provider's job id.
"""

import base64
import binascii
import html
import logging
import random
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import requests

from festiveos.config import sarvam_api_key
from festiveos.core.errors import InvalidInputError, ServiceUnavailableError
from festiveos.integrations.nudgebee import IncidentReporter, get_incidents

LOGGER = logging.getLogger("festiveos.sarvam")
BASE = "https://api.sarvam.ai"
TRANSLATE_MODEL = "sarvam-translate:v1"
RETRYABLE = frozenset({408, 409, 429, 500, 502, 503, 504})
OUT_OF_CREDITS = 402
BAD_INPUT = frozenset({400, 413, 415, 422})  # the person's file, not a Sarvam problem
MAX_RETRIES = 2
MAX_RETRY_WAIT = 8.0
# Speech is part of a live conversation: a person is waiting, and the app gives up on a reply after
# 45 seconds. So one short attempt and one retry (about 25 s at worst), never minutes of silence.
SPEECH_TIMEOUT = 12.0
SPEECH_RETRIES = 1
TERMINAL = frozenset({"completed", "partially_completed", "failed", "rejected"})
OK_JOB = frozenset({"completed", "partially_completed"})
UNAVAILABLE = "Reading documents is unavailable right now. Please try again."
UNREADABLE = "We couldn't read that file. Try a clearer photo or a different file."


def blocks_to_text(results: dict[str, Any]) -> str:
    """The text of every page of a parsed document, tables flattened to rows of ``a | b | c``."""
    pages: list[str] = []
    for document in results.get("documents", []):
        for page in document.get("pages", []):
            texts = [_plain(block.get("text") or "") for block in page.get("blocks", [])]
            pages.append("\n".join(text for text in texts if text))
    return "\n\n".join(page for page in pages if page)


def _plain(text: str) -> str:
    text = re.sub(r"</t[dh]>\s*<t[dh][^>]*>", " | ", text)
    text = re.sub(r"</tr>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    lines = (re.sub(r"[ \t]+", " ", line).strip() for line in html.unescape(text).splitlines())
    return "\n".join(line for line in lines if line)


@dataclass(frozen=True)
class Transcript:
    text: str
    language: str | None  # BCP-47 code of the language that was spoken, e.g. "hi-IN"


class SarvamClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        session: requests.Session | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        poll_seconds: float = 2.0,
        max_wait_seconds: float = 90.0,
        incidents: IncidentReporter | None = None,
    ) -> None:
        self._incidents = incidents
        self._key = api_key if api_key is not None else sarvam_api_key()
        self._session = session or requests.Session()
        self._sleep, self._clock = sleep, clock
        self._poll, self._max_wait = poll_seconds, max_wait_seconds

    # ------------------------------------------------------------------------------- translation

    def translate(self, text: str, *, source: str, target: str) -> str:
        response = self._send(
            "POST",
            "/translate",
            json={
                "input": text,
                "source_language_code": source,
                "target_language_code": target,
                "model": TRANSLATE_MODEL,
            },
        )
        translated = response.json().get("translated_text")
        if not isinstance(translated, str):
            raise ServiceUnavailableError("Translation is unavailable right now.")
        return translated

    # ------------------------------------------------------------------------------------- speech

    def transcribe(self, data: bytes, *, filename: str, content_type: str) -> Transcript:
        """Speech to text in the language that was spoken: none is sent, so it is detected."""
        body = self._send(
            "POST",
            "/speech-to-text",
            files={"file": (filename, data, content_type)},
            data={"model": "saaras:v4", "mode": "transcribe"},
            timeout=SPEECH_TIMEOUT + 8,  # the clip has to be uploaded as well
            retries=SPEECH_RETRIES,
            feature="utsav_voice",
        ).json()
        text = body.get("transcript")
        language = body.get("language_code")
        return Transcript(
            text=text.strip() if isinstance(text, str) else "",
            language=language if isinstance(language, str) else None,
        )

    def speak(self, text: str, *, language: str, pace: float = 1.0) -> bytes:
        """Natural speech (WAV) for ``text`` in ``language``. ``pace`` below 1 speaks slower."""
        body = self._send(
            "POST",
            "/text-to-speech",
            json={
                "text": text,
                "language_code": language,
                "model": "bulbul:v3",
                "pace": pace,
            },
            timeout=SPEECH_TIMEOUT,
            retries=SPEECH_RETRIES,
            feature="utsav_voice",
        ).json()
        try:
            return base64.b64decode(body["audios"][0], validate=True)
        except (KeyError, IndexError, TypeError, binascii.Error) as exc:
            raise ServiceUnavailableError("Speaking is unavailable right now.") from exc

    # ---------------------------------------------------------------------------------- documents

    def extract(
        self,
        data: bytes,
        *,
        filename: str,
        content_type: str,
        schema: str,
        language: str = "en-IN",
    ) -> dict[str, Any]:
        """The fields described by ``schema`` (a JSON schema string), read out of the document."""
        results = self._job(
            "extract",
            data,
            filename,
            content_type,
            {"schema": schema, "language": language, "output_format": "json", "mode": "basic"},
            feature="receipt_scan",
        )
        value = results.get("result")
        return value if isinstance(value, dict) else {}

    def parse(
        self, data: bytes, *, filename: str, content_type: str, language: str = "en-IN"
    ) -> str:
        """The whole document as plain text."""
        results = self._job(
            "parse", data, filename, content_type, {"language": language}, feature="document_upload"
        )
        return blocks_to_text(results)

    # --------------------------------------------------------------------------------- internals

    def _job(
        self,
        kind: str,
        data: bytes,
        filename: str,
        content_type: str,
        fields: dict[str, str],
        *,
        feature: str,
    ) -> dict[str, Any]:
        submitted = self._send(
            "POST",
            f"/doc-ai/v1/job/{kind}",
            files={"file": (filename, data, content_type)},
            data=fields,
            timeout=60,
            feature=feature,
        ).json()
        job_id = submitted.get("job_id")
        if not isinstance(job_id, str):
            raise ServiceUnavailableError(UNAVAILABLE)

        started = self._clock()
        while True:
            polled = self._send("GET", f"/doc-ai/v1/job/{job_id}/status", feature=feature)
            status = str(polled.json().get("status", "")).lower()
            if status in TERMINAL:
                break
            if self._clock() - started > self._max_wait:
                LOGGER.error("document job timed out", extra={"fields": {"kind": kind}})
                raise ServiceUnavailableError(UNAVAILABLE)
            self._sleep(self._poll)

        if status not in OK_JOB:
            LOGGER.warning(
                "document job not completed",
                extra={"fields": {"kind": kind, "status": status, "job_id": job_id}},
            )
            raise InvalidInputError(UNREADABLE)
        return self._send("GET", f"/doc-ai/v1/job/{job_id}/results", feature=feature).json()

    def _send(
        self,
        method: str,
        path: str,
        *,
        timeout: float = 30,
        retries: int = MAX_RETRIES,
        feature: str | None = None,
        **kwargs: Any,
    ) -> requests.Response:
        """One request, retried a bounded number of times with backoff and jitter. Reading and
        translating change nothing on our side, so repeating a call is safe. A final failure that
        is Sarvam's (not the person's file) counts towards a NudgeBee incident for ``feature``."""
        attempt = 0
        while True:
            try:
                response = self._session.request(
                    method,
                    f"{BASE}{path}",
                    headers={"api-subscription-key": self._key},
                    timeout=timeout,
                    **kwargs,
                )
            except requests.RequestException as exc:
                if attempt >= retries:
                    self._log(method, path, None)
                    self._incident(feature, None)
                    raise ServiceUnavailableError(UNAVAILABLE) from exc
            else:
                if response.ok:
                    return response
                if response.status_code not in RETRYABLE or attempt >= retries:
                    self._log(method, path, response.status_code)
                    if response.status_code in BAD_INPUT:
                        raise InvalidInputError(UNREADABLE)
                    self._incident(feature, response.status_code)
                    raise ServiceUnavailableError(UNAVAILABLE)
            attempt += 1
            wait = min(2.0**attempt, MAX_RETRY_WAIT) * random.uniform(0.5, 1.0)  # noqa: S311
            self._sleep(wait)

    def _incident(self, feature: str | None, status: int | None) -> None:
        if self._incidents is None or feature is None:
            return
        reason = "sarvam_credits_exhausted" if status == OUT_OF_CREDITS else "sarvam_errors"
        self._incidents.record(feature, reason)

    @staticmethod
    def _log(method: str, path: str, status: int | None) -> None:
        # Never the body or the file: a response can echo what was sent.
        safe_path = re.sub(r"/job/[0-9a-f-]{8,}", "/job/{id}", path)
        LOGGER.error(
            "sarvam call failed",
            extra={"fields": {"method": method, "path": safe_path, "status": status}},
        )


@lru_cache
def _shared() -> SarvamClient:
    return SarvamClient(incidents=get_incidents())


def get_sarvam() -> SarvamClient | None:
    """None when no key is configured. A function (not a method) so tests can override it."""
    return _shared() if sarvam_api_key() else None
