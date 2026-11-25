import hashlib
import hmac
import json

import pytest
import requests
from fastapi.testclient import TestClient

from festiveos.core.errors import ServiceUnavailableError
from festiveos.integrations.diya import DiyaClient, get_diya, sign
from festiveos.integrations.flags import FeatureFlags, get_feature_flags
from festiveos.main import app
from tests.integrations.test_flags import FakeClient, FakeFlag
from tests.support import API, auth, setup_household

PHONE = "+919876543210"
GOOD = {
    "phone": PHONE,
    "language": "kn-IN",
    "topic": "expense_dispute",
    "note": "Wrong split",
    "consent": True,
}


class FakeDiya:
    def __init__(self, answer=None, error: Exception | None = None) -> None:
        self.answer = answer if answer is not None else {"queryId": "q_123", "status": "created"}
        self.error, self.sent = error, []

    def create_support_request(self, payload):
        self.sent.append(payload)
        if self.error:
            raise self.error
        return self.answer


@pytest.fixture
def diya():
    from festiveos.integrations.diya import get_diya as dependency

    fake = FakeDiya()
    app.dependency_overrides[dependency] = lambda: fake
    yield fake
    app.dependency_overrides.pop(dependency, None)


def ask(client, user, body=None):
    return client.post(f"{API}/support/callback", json=body or GOOD, headers=auth(user))


# ------------------------------------------------------------------------------------ the route


def test_a_person_can_ask_for_a_call_back_and_what_is_sent_is_the_minimum(
    client: TestClient, make_user, diya: FakeDiya
) -> None:
    dad, _, _ = setup_household(client, make_user)

    response = ask(client, dad)

    assert response.status_code == 201
    assert response.json()["status"] == "sent"
    sent = diya.sent[0]
    assert sent["phone"] == PHONE
    assert sent["preferredLang"] == "kn-IN"
    assert sent["category"] == "festiveos_support"
    assert sent["issueSummary"] == "Expense dispute: Wrong split"
    assert sent["consent"]["source"] == "festiveos_app"
    assert sent["consent"]["at"]
    # Nothing beyond what a call needs: no email, no groups, no festivals.
    assert set(sent) == {
        "requestId",
        "externalUserId",
        "name",
        "phone",
        "preferredLang",
        "consent",
        "category",
        "topic",
        "issueSummary",
    }


def test_the_phone_number_and_note_are_never_kept(
    client: TestClient, make_user, diya: FakeDiya, session_factory
) -> None:
    from sqlalchemy import select

    from festiveos.support.models import SupportCallback

    dad, _, _ = setup_household(client, make_user)
    ask(client, dad)

    with session_factory() as session:
        row = session.scalars(select(SupportCallback)).one()
        stored = " ".join(str(getattr(row, c.name)) for c in SupportCallback.__table__.columns)
    assert PHONE not in stored
    assert "Wrong split" not in stored
    assert row.remote_id == "q_123"
    assert row.consent_text_version


@pytest.mark.parametrize("consent", [False, None, "yes", 0])
def test_without_a_clear_yes_nothing_is_sent(
    client: TestClient, make_user, diya: FakeDiya, consent
) -> None:
    dad, _, _ = setup_household(client, make_user)
    body = {**GOOD, "consent": consent}

    assert ask(client, dad, body).status_code == 422
    assert diya.sent == []


def test_consent_cannot_be_left_out(client: TestClient, make_user, diya: FakeDiya) -> None:
    dad, _, _ = setup_household(client, make_user)
    body = {k: v for k, v in GOOD.items() if k != "consent"}

    assert ask(client, dad, body).status_code == 422
    assert diya.sent == []


@pytest.mark.parametrize(
    "phone", ["9876543210", "+0123456789", "+91", "call me", "+91987654321012345", "'; DROP--"]
)
def test_a_phone_number_must_be_international_format(
    client: TestClient, make_user, diya: FakeDiya, phone
) -> None:
    dad, _, _ = setup_household(client, make_user)

    assert ask(client, dad, {**GOOD, "phone": phone}).status_code == 422
    assert diya.sent == []


def test_spaces_and_dashes_people_type_are_tidied(
    client: TestClient, make_user, diya: FakeDiya
) -> None:
    dad, _, _ = setup_household(client, make_user)

    assert ask(client, dad, {**GOOD, "phone": "+91 98765-43210"}).status_code == 201
    assert diya.sent[0]["phone"] == PHONE


@pytest.mark.parametrize(
    "change",
    [{"topic": "refund_please"}, {"language": "xx-XX"}, {"note": "x" * 301}, {"extra": "field"}],
)
def test_unknown_topics_languages_and_long_notes_are_refused(
    client: TestClient, make_user, diya: FakeDiya, change
) -> None:
    dad, _, _ = setup_household(client, make_user)

    assert ask(client, dad, {**GOOD, **change}).status_code == 422


def test_a_note_is_optional_and_tidied(client: TestClient, make_user, diya: FakeDiya) -> None:
    dad, _, _ = setup_household(client, make_user)
    ask(client, dad, {**GOOD, "note": "  Two\n\nlines   here "})
    ask(client, dad, {k: v for k, v in GOOD.items() if k != "note"})

    assert diya.sent[0]["issueSummary"] == "Expense dispute: Two lines here"
    assert diya.sent[1]["issueSummary"] == "Expense dispute"


def test_you_must_be_signed_in(client: TestClient, diya: FakeDiya) -> None:
    assert client.post(f"{API}/support/callback", json=GOOD).status_code == 401
    assert diya.sent == []


def test_a_person_cannot_ask_more_than_three_times_a_day(
    client: TestClient, make_user, diya: FakeDiya, fresh_rate_limits
) -> None:
    dad, _, _ = setup_household(client, make_user)

    codes = [ask(client, dad).status_code for _ in range(4)]

    assert codes == [201, 201, 201, 429]
    assert len(diya.sent) == 3


# --------------------------------------------------------------------- when support is not there


def test_a_support_platform_that_is_down_is_a_calm_error_and_nothing_is_recorded(
    client: TestClient, make_user, session_factory
) -> None:
    from sqlalchemy import func, select

    from festiveos.support.models import SupportCallback

    dad, _, _ = setup_household(client, make_user)
    fake = FakeDiya(error=ServiceUnavailableError("We couldn't reach support just now."))
    app.dependency_overrides[get_diya] = lambda: fake
    try:
        response = ask(client, dad)
    finally:
        app.dependency_overrides.pop(get_diya, None)

    assert response.status_code == 503
    assert PHONE not in response.text
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(SupportCallback)) == 0


def test_without_configuration_the_feature_is_unavailable_not_broken(
    client: TestClient, make_user, monkeypatch
) -> None:
    monkeypatch.delenv("DIYA_BASE_URL", raising=False)
    monkeypatch.delenv("DIYA_INTEGRATION_SECRET", raising=False)
    dad, _, _ = setup_household(client, make_user)

    assert get_diya() is None
    assert ask(client, dad).status_code == 503


def test_a_person_who_must_not_be_called_is_told_so_kindly(client: TestClient, make_user) -> None:
    dad, _, _ = setup_household(client, make_user)
    fake = FakeDiya(answer={"status": "do_not_call"})
    app.dependency_overrides[get_diya] = lambda: fake
    try:
        response = ask(client, dad)
    finally:
        app.dependency_overrides.pop(get_diya, None)

    assert response.status_code == 201
    assert response.json()["status"] == "do_not_call"


def test_the_feature_can_be_switched_off_from_flagsmith(
    client: TestClient, make_user, diya: FakeDiya
) -> None:
    dad, _, _ = setup_household(client, make_user)
    flags = FeatureFlags(FakeClient({"support_callback": FakeFlag(enabled=False)}))
    app.dependency_overrides[get_feature_flags] = lambda: flags
    try:
        response = ask(client, dad)
    finally:
        app.dependency_overrides.pop(get_feature_flags, None)

    assert response.status_code == 503
    assert "switched off" in response.json()["detail"]
    assert diya.sent == []


# ---------------------------------------------------------------------------- the signed client


class Session:
    def __init__(self, reply=None, error=None) -> None:
        self.reply, self.error, self.calls = reply, error, []

    def post(self, url, **kwargs):
        self.calls.append({"url": url, **kwargs})
        if self.error:
            raise self.error
        return self.reply


class Reply:
    def __init__(self, status=200, body=None, ok=None) -> None:
        self.status_code, self._body = (
            status,
            body if body is not None else {"queryId": "q1", "status": "created"},
        )
        self.ok = status < 400 if ok is None else ok

    def json(self):
        return self._body


def make_client(session) -> DiyaClient:
    return DiyaClient(
        base_url="https://support.example.com/",
        secret="s3cret",
        session=session,
        clock=lambda: 1_700_000_000,
    )


def test_every_request_is_signed_over_the_time_and_the_exact_body() -> None:
    session = Session(Reply())
    make_client(session).create_support_request({"phone": PHONE, "name": "Vikram"})

    call = session.calls[0]
    assert call["url"] == "https://support.example.com/api/integrations/support-requests"
    timestamp = call["headers"]["X-Festiveos-Timestamp"]
    assert timestamp == "1700000000"
    expected = hmac.new(
        b"s3cret", timestamp.encode() + b"." + call["data"], hashlib.sha256
    ).hexdigest()
    assert call["headers"]["X-Festiveos-Signature"] == expected
    assert call["headers"]["X-Festiveos-Signature"] == sign("s3cret", timestamp, call["data"])
    assert json.loads(call["data"])["phone"] == PHONE
    assert "s3cret" not in call["data"].decode()  # the secret itself is never sent


def test_a_different_body_or_time_gives_a_different_signature() -> None:
    assert sign("s", "1", b"a") != sign("s", "1", b"b")
    assert sign("s", "1", b"a") != sign("s", "2", b"a")
    assert sign("s", "1", b"a") != sign("t", "1", b"a")


def test_a_short_timeout_and_a_calm_error_when_the_network_fails() -> None:
    session = Session(error=requests.Timeout("slow"))

    with pytest.raises(ServiceUnavailableError):
        make_client(session).create_support_request({"phone": PHONE})

    assert session.calls[0]["timeout"] <= 10


def test_a_refusal_does_not_leak_what_was_sent_or_what_came_back(caplog) -> None:
    session = Session(Reply(status=500, body={"echo": PHONE}))

    with (
        pytest.raises(ServiceUnavailableError) as raised,
        caplog.at_level("ERROR", logger="festiveos.diya"),
    ):
        make_client(session).create_support_request({"phone": PHONE})

    assert PHONE not in str(raised.value)
    assert PHONE not in caplog.text
    assert "s3cret" not in caplog.text


def test_python_and_the_web_server_compute_the_same_signature() -> None:
    """The same vector is asserted in web/server (festiveos.test.ts). If either side changes how it
    signs, one of the two tests fails, instead of the integration silently stopping with 401s."""
    body = '{"phone":"+919876543210","name":"विक्रम"}'.encode()

    assert (
        sign("s3cret", "1700000000", body)
        == "c9fde37d86c5f8ec2f973a9168433eb33ea197600d705b7089f47d9283c2d374"
    )
