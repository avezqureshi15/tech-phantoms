import pytest
from fastapi.testclient import TestClient

from festiveos.integrations.flags import DEFAULTS, FeatureFlags, get_feature_flags
from festiveos.integrations.sarvam import get_sarvam
from festiveos.main import app
from tests.ai.conftest import FakeLLM, text, use
from tests.ai.test_conversations import start
from tests.integrations.test_flags import FakeClient, FakeFlag
from tests.support import API, auth, setup_household

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 100
M4A = b"\x00\x00\x00\x20ftypM4A " + b"0" * 200


def flags_with(**table) -> FeatureFlags:
    return FeatureFlags(FakeClient({name: FakeFlag(**spec) for name, spec in table.items()}))


@pytest.fixture
def switch():
    def apply(flags: FeatureFlags) -> None:
        app.dependency_overrides[get_feature_flags] = lambda: flags

    yield apply
    app.dependency_overrides.pop(get_feature_flags, None)


def test_the_app_is_told_what_is_on_and_everything_is_on_by_default(
    client: TestClient, make_user
) -> None:
    dad, _, _ = setup_household(client, make_user)

    body = client.get(f"{API}/features", headers=auth(dad)).json()

    assert body == {"features": DEFAULTS, "announcement": None}


def test_features_need_a_signed_in_person(client: TestClient) -> None:
    assert client.get(f"{API}/features").status_code == 401


def test_a_switched_off_feature_and_an_announcement_reach_the_app(
    client: TestClient, make_user, switch
) -> None:
    dad, _, _ = setup_household(client, make_user)
    switch(
        flags_with(
            elder_mode={"enabled": False}, announcement={"enabled": True, "value": "Back at 10pm"}
        )
    )

    body = client.get(f"{API}/features", headers=auth(dad)).json()

    assert body["features"]["elder_mode"] is False
    assert body["features"]["utsav"] is True
    assert body["announcement"] == "Back at 10pm"


def test_the_flags_are_evaluated_for_this_person_by_their_id(client: TestClient, make_user) -> None:
    dad, _, _ = setup_household(client, make_user)
    fake = FakeClient()
    app.dependency_overrides[get_feature_flags] = lambda: FeatureFlags(fake)
    try:
        client.get(f"{API}/features", headers=auth(dad))
    finally:
        app.dependency_overrides.pop(get_feature_flags, None)

    assert len(fake.identities) == 1
    identifier, traits, _ = fake.identities[0]
    assert len(identifier) == 36  # a UUID: nothing like an email or a name
    assert traits is None


# ----------------------------------------------------------------------------- server enforcement


def test_switching_utsav_off_stops_every_ai_route_before_any_paid_call(
    client: TestClient, make_user, llm: FakeLLM, switch
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    switch(flags_with(utsav={"enabled": False}))

    chat = start(client, dad, household_id)
    stream = client.post(
        f"{API}/households/{household_id}/ai/conversations/stream",
        json={"message": "hi"},
        headers=auth(dad),
    )
    voice = client.post(
        f"{API}/households/{household_id}/ai/speak", json={"text": "hi"}, headers=auth(dad)
    )

    assert [r.status_code for r in (chat, stream, voice)] == [503, 503, 503]
    assert "switched off" in chat.json()["detail"]
    assert llm.requests == []


def test_switching_voice_off_leaves_chat_working(
    client: TestClient, make_user, llm: FakeLLM, switch
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    switch(flags_with(utsav_voice={"enabled": False}))
    llm.will(text("Namaste."))

    speak = client.post(
        f"{API}/households/{household_id}/ai/speak", json={"text": "hi"}, headers=auth(dad)
    )
    transcribe = client.post(
        f"{API}/households/{household_id}/ai/transcribe",
        files={"file": ("v.m4a", M4A, "audio/mp4")},
        headers=auth(dad),
    )
    chat = start(client, dad, household_id)

    assert speak.status_code == 503
    assert transcribe.status_code == 503
    assert chat.status_code == 201


@pytest.mark.parametrize(("mode", "flag"), [("elder", "elder_mode"), ("recite", "recite_mode")])
def test_a_mode_switched_off_refuses_to_start_but_the_normal_chat_is_untouched(
    client: TestClient, make_user, llm: FakeLLM, switch, mode, flag
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    switch(flags_with(**{flag: {"enabled": False}}))
    llm.will(text("Hello."))

    refused = client.post(
        f"{API}/households/{household_id}/ai/conversations",
        json={"message": "hi", "mode": mode},
        headers=auth(dad),
    )
    normal = start(client, dad, household_id)

    assert refused.status_code == 503
    assert normal.status_code == 201
    assert len(llm.requests) == 1  # only the normal chat reached the model


def test_switching_document_reading_off_stops_uploads_and_receipt_scans_separately(
    client: TestClient, make_user, switch
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    app.dependency_overrides[get_sarvam] = lambda: (
        None
    )  # would be a 503 anyway: the flag must answer first
    try:
        switch(flags_with(document_upload={"enabled": False}))
        upload = client.post(
            f"{API}/households/{household_id}/ai/documents",
            files={"file": ("d.png", PNG, "image/png")},
            headers=auth(dad),
        )
        scan = client.post(
            f"{API}/households/{household_id}/expenses/scan",
            files={"file": ("r.png", PNG, "image/png")},
            headers=auth(dad),
        )
        assert "Documents is switched off" in upload.json()["detail"]
        assert "switched off" not in scan.json()["detail"]  # receipts are a different feature

        switch(flags_with(receipt_scan={"enabled": False}))
        scan = client.post(
            f"{API}/households/{household_id}/expenses/scan",
            files={"file": ("r.png", PNG, "image/png")},
            headers=auth(dad),
        )
        assert "Receipt scanning is switched off" in scan.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_sarvam, None)


def test_a_flag_service_that_is_down_changes_nothing(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    app.dependency_overrides[get_feature_flags] = lambda: FeatureFlags(
        FakeClient(error=ConnectionError("down"))
    )
    llm.will(text("Namaste."))
    try:
        response = start(client, dad, household_id)
    finally:
        app.dependency_overrides.pop(get_feature_flags, None)

    assert response.status_code == 201


def test_event_search_off_still_offers_the_site_searches_without_the_costly_web_search(
    client: TestClient, make_user, llm: FakeLLM, switch
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    switch(flags_with(event_search={"enabled": False}))
    searched = []
    llm.search = lambda *, prompt, domains: searched.append(prompt) or "[]"
    llm.will(
        use(("find_events", {"query": "Diwali party", "city": "Bengaluru"})), text("Here you go.")
    )

    turn = start(client, dad, household_id, message="any diwali parties near me?").json()

    card = next(i["card"] for i in turn["items"] if i["type"] == "card")
    assert card["kind"] == "links"
    assert all(
        link["label"].startswith("More on") or link["label"] == "Search everywhere"
        for link in card["links"]
    )
    assert searched == []
