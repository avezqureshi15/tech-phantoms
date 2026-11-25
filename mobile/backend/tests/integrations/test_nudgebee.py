import json
from datetime import UTC, datetime

import pytest
import requests

from festiveos.config import nudgebee_environment
from festiveos.integrations.nudgebee import WINDOW_MINUTES, IncidentReporter, build_incidents

URL = "https://hooks.nudgebee.example/trigger/secret-token"
WINDOW = WINDOW_MINUTES * 60


class Reply:
    def __init__(self, status: int = 200) -> None:
        self.status_code, self.ok = status, status < 400


class Session:
    """Answers each post with the next queued reply (or raises it) and remembers what was sent."""

    def __init__(self, *replies) -> None:
        self.replies, self.calls = list(replies), []

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        reply = self.replies.pop(0) if self.replies else Reply()
        if isinstance(reply, Exception):
            raise reply
        return reply


class Clock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


def reporter(*replies, url: str | None = URL) -> tuple[IncidentReporter, Session, Clock]:
    session, clock = Session(*replies), Clock()
    incidents = IncidentReporter(
        url,
        environment="demo",
        session=session,
        submit=lambda job: job(),  # run the send inline so the test can see it
        clock=clock,
        now=lambda: datetime(2026, 11, 25, 10, 42, tzinfo=UTC),
    )
    return incidents, session, clock


def payloads(session: Session) -> list[dict]:
    return [call["json"] for call in session.calls]


def test_out_of_credits_is_reported_at_once_with_the_agreed_payload() -> None:
    incidents, session, _ = reporter()

    incidents.record("utsav_voice", "sarvam_credits_exhausted")

    assert payloads(session) == [
        {
            "event": "FEATURE_INCIDENT",
            "environment": "demo",
            "feature": "utsav_voice",
            "reason": "sarvam_credits_exhausted",
            "summary": "Voice: Sarvam reports exhausted credits (1 failures in 10 minutes).",
            "suggested_action": "Switch off utsav_voice in Flagsmith",
            "count": 1,
            "window_minutes": WINDOW_MINUTES,
            "occurred_at": "2026-11-25T10:42:00Z",
        }
    ]
    assert session.calls[0]["url"] == URL
    assert session.calls[0]["timeout"] <= 5  # never holds the worker for long


def test_errors_are_reported_only_once_the_threshold_is_reached() -> None:
    incidents, session, _ = reporter()

    for _ in range(4):
        incidents.record("utsav", "ai_provider_errors")
    assert session.calls == []

    incidents.record("utsav", "ai_provider_errors")
    assert [p["count"] for p in payloads(session)] == [5]


def test_one_incident_per_feature_and_reason_per_window() -> None:
    incidents, session, clock = reporter()

    for _ in range(50):
        incidents.record("utsav", "ai_provider_errors")
    incidents.record("receipt_scan", "sarvam_credits_exhausted")  # a different pair still goes out
    assert [(p["feature"], p["reason"]) for p in payloads(session)] == [
        ("utsav", "ai_provider_errors"),
        ("receipt_scan", "sarvam_credits_exhausted"),
    ]

    clock.now += WINDOW + 1  # the next window: still failing, so it is reported again
    for _ in range(5):
        incidents.record("utsav", "ai_provider_errors")
    assert len(session.calls) == 3


def test_old_events_fall_out_of_the_window() -> None:
    incidents, session, clock = reporter()

    for _ in range(4):
        incidents.record("utsav", "ai_provider_errors")
    clock.now += WINDOW + 1
    incidents.record("utsav", "ai_provider_errors")  # only one failure in this window

    assert session.calls == []


def test_without_a_url_nothing_is_counted_or_sent() -> None:
    incidents, session, _ = reporter(url=None)

    incidents.record("utsav_voice", "sarvam_credits_exhausted")

    assert not incidents.enabled
    assert session.calls == []


def test_unknown_features_and_reasons_are_ignored() -> None:
    incidents, session, _ = reporter()

    incidents.record("birthdays", "sarvam_credits_exhausted")
    incidents.record("utsav", "the_moon_is_full")

    assert session.calls == []


@pytest.mark.parametrize(
    "outcome", [Reply(500), Reply(404), requests.ConnectionError("down"), requests.Timeout("slow")]
)
def test_nudgebee_failing_never_raises_and_never_logs_the_url(outcome, caplog) -> None:
    incidents, _, _ = reporter(outcome)

    incidents.record("utsav_voice", "sarvam_credits_exhausted")  # must not raise

    assert "nudgebee could not be reached" in caplog.text
    assert "secret-token" not in caplog.text


def test_no_personal_data_is_sent() -> None:
    incidents, session, _ = reporter()

    incidents.record("document_upload", "sarvam_credits_exhausted")

    assert set(payloads(session)[0]) == {
        "event",
        "environment",
        "feature",
        "reason",
        "summary",
        "suggested_action",
        "count",
        "window_minutes",
        "occurred_at",
    }
    json.dumps(payloads(session)[0])  # plain JSON, nothing else


def test_sending_happens_off_the_request_thread() -> None:
    submitted: list = []
    session = Session()
    incidents = IncidentReporter(URL, session=session, submit=submitted.append)

    incidents.record("utsav_voice", "sarvam_credits_exhausted")

    assert len(submitted) == 1
    assert session.calls == []  # nothing sent until the background worker runs the job
    submitted[0]()
    assert len(session.calls) == 1


@pytest.mark.parametrize(
    ("url", "enabled"),
    [
        ("", False),
        ("http://hooks.nudgebee.example/trigger", False),  # never in clear text
        ("not a url", False),
        (URL, True),
    ],
)
def test_only_an_https_url_turns_reporting_on(monkeypatch, url, enabled) -> None:
    monkeypatch.setenv("NUDGEBEE_WEBHOOK_URL", url)

    assert build_incidents().enabled is enabled


@pytest.mark.parametrize(("value", "expected"), [(None, "production"), (" staging ", "staging")])
def test_the_environment_name_defaults_to_production(monkeypatch, value, expected) -> None:
    if value is None:
        monkeypatch.delenv("NUDGEBEE_ENVIRONMENT", raising=False)
    else:
        monkeypatch.setenv("NUDGEBEE_ENVIRONMENT", value)

    assert nudgebee_environment() == expected
