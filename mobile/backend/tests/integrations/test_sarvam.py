import pytest
import requests

from festiveos.core.errors import InvalidInputError, ServiceUnavailableError
from festiveos.integrations.sarvam import SarvamClient, blocks_to_text


class Reply:
    def __init__(self, status: int = 200, body: dict | None = None) -> None:
        self.status_code, self._body, self.ok = status, body or {}, status < 400

    def json(self) -> dict:
        return self._body


class Session:
    """Answers each request with the next queued reply (or raises it) and remembers the requests."""

    def __init__(self, *replies) -> None:
        self.replies, self.calls = list(replies), []

    def request(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, **kwargs})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def sleep(self, seconds: float) -> None:
        self.now += seconds

    def __call__(self) -> float:
        return self.now


def client(*replies, max_wait: float = 90.0) -> tuple[SarvamClient, Session, Clock]:
    session, clock = Session(*replies), Clock()
    sarvam = SarvamClient(
        api_key="sk-test-secret",
        session=session,
        sleep=clock.sleep,
        clock=clock,
        poll_seconds=2,
        max_wait_seconds=max_wait,
    )
    return sarvam, session, clock


def job(*statuses: str, results: dict | None = None) -> list[Reply]:
    return [
        Reply(201, {"job_id": "01a21080-2f3f-70e6-ac0d-7623d2dcab0a", "status": "pending"}),
        *[Reply(200, {"status": s}) for s in statuses],
        Reply(200, results or {}),
    ]


def test_translation_sends_the_key_and_languages_and_returns_the_text() -> None:
    sarvam, session, _ = client(Reply(200, {"translated_text": "नमस्ते"}))

    assert sarvam.translate("Hello", source="en-IN", target="hi-IN") == "नमस्ते"

    call = session.calls[0]
    assert call["url"] == "https://api.sarvam.ai/translate"
    assert call["headers"] == {"api-subscription-key": "sk-test-secret"}
    assert call["json"]["target_language_code"] == "hi-IN"
    assert call["json"]["model"] == "sarvam-translate:v1"


def test_a_translation_without_text_is_unavailable_not_a_crash() -> None:
    sarvam, _, _ = client(Reply(200, {"something": "else"}))

    with pytest.raises(ServiceUnavailableError):
        sarvam.translate("Hello", source="en-IN", target="hi-IN")


def test_extract_submits_polls_until_done_then_returns_the_fields() -> None:
    sarvam, session, clock = client(
        *job("pending", "running", "completed", results={"result": {"total": 1323}})
    )

    fields = sarvam.extract(
        b"%PDF-1", filename="r.pdf", content_type="application/pdf", schema='{"type":"object"}'
    )

    assert fields == {"total": 1323}
    submit = session.calls[0]
    assert submit["url"].endswith("/doc-ai/v1/job/extract")
    assert submit["files"]["file"] == ("r.pdf", b"%PDF-1", "application/pdf")
    assert submit["data"]["schema"] == '{"type":"object"}'
    assert [c["method"] for c in session.calls] == ["POST", "GET", "GET", "GET", "GET"]
    assert clock.now == 4  # waited 2s between each of the two unfinished polls


@pytest.mark.parametrize("status", ["failed", "rejected"])
def test_a_job_the_reader_could_not_do_is_an_unreadable_file_not_an_outage(status) -> None:
    sarvam, _, _ = client(*job(status)[:-1])

    with pytest.raises(InvalidInputError, match="couldn't read"):
        sarvam.parse(b"x", filename="a.png", content_type="image/png")


def test_a_job_that_never_finishes_gives_up() -> None:
    sarvam, _, _ = client(
        Reply(201, {"job_id": "01a21080-2f3f-70e6-ac0d-7623d2dcab0a"}),
        *[Reply(200, {"status": "running"})] * 20,
        max_wait=10,
    )

    with pytest.raises(ServiceUnavailableError):
        sarvam.parse(b"x", filename="a.png", content_type="image/png")


@pytest.mark.parametrize("status", [429, 500, 503])
def test_transient_failures_are_retried_with_backoff(status) -> None:
    sarvam, session, clock = client(Reply(status), Reply(200, {"translated_text": "ok"}))

    assert sarvam.translate("a", source="en-IN", target="hi-IN") == "ok"
    assert len(session.calls) == 2
    assert 0 < clock.now <= 8


def test_retries_are_bounded_and_connection_errors_are_handled() -> None:
    sarvam, session, _ = client(*[requests.ConnectionError("boom")] * 5)

    with pytest.raises(ServiceUnavailableError):
        sarvam.translate("a", source="en-IN", target="hi-IN")

    assert len(session.calls) == 3


@pytest.mark.parametrize("status", [400, 413, 415, 422])
def test_a_rejected_file_is_a_user_error_and_is_not_retried(status) -> None:
    sarvam, session, _ = client(Reply(status))

    with pytest.raises(InvalidInputError):
        sarvam.extract(b"x", filename="a", content_type="image/png", schema="{}")

    assert len(session.calls) == 1


@pytest.mark.parametrize("status", [401, 403, 404])
def test_a_bad_key_or_endpoint_is_an_outage_and_never_leaks_the_key(status, caplog) -> None:
    sarvam, _, _ = client(Reply(status))

    with pytest.raises(ServiceUnavailableError) as raised, caplog.at_level("ERROR"):
        sarvam.translate("secret text", source="en-IN", target="hi-IN")

    shown = str(raised.value) + caplog.text
    assert "sk-test-secret" not in shown
    assert "secret text" not in shown


def test_parsed_pages_become_plain_text_with_tables_flattened() -> None:
    results = {
        "documents": [
            {
                "pages": [
                    {
                        "blocks": [
                            {"text": "SHARMA SWEETS"},
                            {
                                "text": "<table><tr><td>Kaju Katli</td><td>Rs 900</td></tr>"
                                "<tr><td>Tea &amp; snacks</td><td>Rs 120</td></tr></table>"
                            },
                            {"text": ""},
                        ]
                    },
                    {"blocks": [{"text": "Page two"}]},
                ]
            }
        ]
    }

    assert blocks_to_text(results) == (
        "SHARMA SWEETS\nKaju Katli | Rs 900\nTea & snacks | Rs 120\n\nPage two"
    )
    assert blocks_to_text({}) == ""


# ------------------------------------------------- speech is live: short waits, never minutes


def test_a_slow_speech_call_gives_up_quickly_so_a_person_is_never_left_in_silence() -> None:
    slow = requests.Timeout("slow")
    sarvam, session, _ = client(slow, slow, slow)

    with pytest.raises(ServiceUnavailableError):
        sarvam.speak("नमस्ते", language="hi-IN")

    assert len(session.calls) == 2  # one try and one retry, not three
    assert all(call["timeout"] <= 15 for call in session.calls)
    # Worst case: two attempts plus one short pause, well inside the app's 45 s patience.
    assert sum(call["timeout"] for call in session.calls) + 8 < 45


def test_speech_recovers_when_the_retry_succeeds() -> None:
    import base64

    audio = base64.b64encode(b"RIFFwav").decode()
    sarvam, session, _ = client(requests.Timeout("slow"), Reply(200, {"audios": [audio]}))

    assert sarvam.speak("नमस्ते", language="hi-IN") == b"RIFFwav"
    assert len(session.calls) == 2


def test_transcription_is_also_bounded_and_retried_once() -> None:
    slow = requests.Timeout("slow")
    sarvam, session, _ = client(slow, slow, slow)

    with pytest.raises(ServiceUnavailableError):
        sarvam.transcribe(b"x", filename="v.m4a", content_type="audio/mp4")

    assert len(session.calls) == 2
    assert all(call["timeout"] <= 25 for call in session.calls)


def test_reading_documents_keeps_its_longer_patience() -> None:
    sarvam, session, _ = client(
        requests.Timeout("slow"), requests.Timeout("slow"), requests.Timeout("slow")
    )

    with pytest.raises(ServiceUnavailableError):
        sarvam.translate("Hello", source="en-IN", target="hi-IN")

    assert len(session.calls) == 3
