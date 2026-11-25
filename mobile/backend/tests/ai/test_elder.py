import pytest
from fastapi.testclient import TestClient

from festiveos.ai.agents import AGENTS
from festiveos.ai.prompts import playbook
from festiveos.ai.speech import detect_language, first_chunk, native_only, speakable
from festiveos.integrations.sarvam import get_sarvam
from festiveos.main import app
from tests.ai.conftest import FakeLLM, text, use
from tests.ai.test_conversations import QUESTION
from tests.support import API, auth, setup_household

WAV = b"RIFF\x24\x00\x00\x00WAVEfmt " + b"0" * 40


# --------------------------------------------------------------------------------- the language


@pytest.mark.parametrize(
    ("words", "language"),
    [
        ("Namaste, shall we begin?", "en-IN"),
        ("श्रीगुरु चरन सरोज रज", "hi-IN"),
        ("ನಮ್ಮ ಮನೆಯಲ್ಲಿ ಹಬ್ಬ", "kn-IN"),
        ("வணக்கம் எப்படி இருக்கிறீர்கள்", "ta-IN"),
        ("నమస్కారం ఎలా ఉన్నారు", "te-IN"),
        ("നമസ്കാരം സുഖമാണോ", "ml-IN"),
        ("ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "pa-IN"),
        ("નમસ્તે કેમ છો", "gu-IN"),
        ("নমস্কার কেমন আছেন", "bn-IN"),
        ("Diwali दिवाली mubarak ho aapko", "en-IN"),  # mostly Latin letters: Indian English
        ("", "en-IN"),
        ("1234 !!", "en-IN"),
    ],
)
def test_the_language_is_read_from_the_script(words, language) -> None:
    assert detect_language(words) == language


def test_a_mostly_native_script_sentence_with_a_loan_word_keeps_its_language() -> None:
    assert detect_language("आज हम Diwali की तैयारी करेंगे") == "hi-IN"


def test_markdown_and_emoji_are_removed_so_a_voice_does_not_read_them_out() -> None:
    spoken = speakable(
        "## Hanuman Chalisa 🙏\n\n- **Doha:** श्रीगुरु *चरन*\n- See [this page](https://x.in/a) or https://y.in\n```\ncode\n```"
    )

    assert spoken == "Hanuman Chalisa Doha: श्रीगुरु चरन See this page or"
    assert "*" not in spoken
    assert "http" not in spoken
    assert "🙏" not in spoken


def test_long_text_is_cut_at_a_sentence_end_and_short_text_is_untouched() -> None:
    sentence = "This is a sentence. "
    long = sentence * 200

    cut = first_chunk(long, limit=300)

    assert len(cut) <= 300
    assert cut.endswith(".")
    assert first_chunk("short") == "short"


# ---------------------------------------------------------------------------- the speak endpoint


class FakeVoice:
    def __init__(self) -> None:
        self.calls = []

    def speak(self, text, *, language, pace=1.0, voice=None):
        self.calls.append({"text": text, "language": language, "pace": pace, "voice": voice})
        return WAV


@pytest.fixture
def voice():
    fake = FakeVoice()
    app.dependency_overrides[get_sarvam] = lambda: fake
    yield fake
    app.dependency_overrides.pop(get_sarvam, None)


def speak(client, user, household_id, **body):
    return client.post(f"{API}/households/{household_id}/ai/speak", json=body, headers=auth(user))


def test_the_voice_comes_from_the_environment_and_a_flag_can_change_it(
    client: TestClient, make_user, voice: FakeVoice, monkeypatch
) -> None:
    from festiveos.integrations.flags import FeatureFlags, get_feature_flags
    from tests.integrations.test_flags import FakeClient, FakeFlag

    dad, _, household_id = setup_household(client, make_user)
    monkeypatch.setenv("SARVAM_VOICE", "Priya")

    speak(client, dad, household_id, text="नमस्ते")
    assert voice.calls[-1]["voice"] == "priya"  # tidied: lower case

    flags = FeatureFlags(FakeClient({"tts_voice": FakeFlag(value="kavya")}))
    app.dependency_overrides[get_feature_flags] = lambda: flags
    try:
        speak(client, dad, household_id, text="नमस्ते")
    finally:
        app.dependency_overrides.pop(get_feature_flags, None)
    assert voice.calls[-1]["voice"] == "kavya"  # the flag wins, with no release


def test_text_is_spoken_in_the_language_it_is_written_in(
    client: TestClient, make_user, voice: FakeVoice
) -> None:
    dad, _, household_id = setup_household(client, make_user)

    response = speak(client, dad, household_id, text="**ನಮಸ್ಕಾರ** 🙏 ಇವತ್ತು ಏನು ಮಾಡೋಣ?")

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == WAV
    assert voice.calls == [
        {"text": "ನಮಸ್ಕಾರ ಇವತ್ತು ಏನು ಮಾಡೋಣ?", "language": "kn-IN", "pace": 1.0, "voice": None}
    ]


def test_a_slower_pace_is_passed_on_and_an_unknown_language_is_ignored(
    client: TestClient, make_user, voice: FakeVoice
) -> None:
    dad, _, household_id = setup_household(client, make_user)

    speak(client, dad, household_id, text="Namaste", pace=0.8, language="xx-YY")

    assert voice.calls == [{"text": "Namaste", "language": "en-IN", "pace": 0.8, "voice": None}]


@pytest.mark.parametrize(
    "body", [{"text": ""}, {"text": "x", "pace": 0.1}, {"text": "x", "pace": 3}]
)
def test_bad_speak_requests_are_refused(client: TestClient, make_user, voice, body) -> None:
    dad, _, household_id = setup_household(client, make_user)

    assert speak(client, dad, household_id, **body).status_code == 422
    assert voice.calls == []


def test_text_with_nothing_to_say_and_a_missing_voice_are_handled(
    client: TestClient, make_user, voice
) -> None:
    dad, _, household_id = setup_household(client, make_user)

    assert speak(client, dad, household_id, text="🙏 ** ##").status_code == 422
    assert speak(
        client, make_user("outsider@example.com"), household_id, text="hi"
    ).status_code in (403, 404)
    app.dependency_overrides[get_sarvam] = lambda: None
    assert speak(client, dad, household_id, text="hi").status_code == 503


# ---------------------------------------------------------------------------------- elder mode


def begin(client, user, household_id, message="namaste", mode="elder"):
    return client.post(
        f"{API}/households/{household_id}/ai/conversations",
        json={"message": message, "mode": mode},
        headers=auth(user),
    )


def test_elder_mode_starts_the_elder_agent_with_its_own_instructions(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Namaste ji."))

    turn = begin(client, dad, household_id).json()

    assert turn["agent"] == "elder"
    notes = [m["content"] for m in llm.requests[0]["messages"] if m["role"] == "system"]
    assert notes == [playbook("elder")]
    assert "ELDER MODE" in notes[0]


def test_an_elder_conversation_stays_in_elder_mode_for_every_message(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Namaste ji."), text("Wonderful. Next line."))
    first = begin(client, dad, household_id).json()

    second = client.post(
        f"{API}/ai/conversations/{first['conversation_id']}/messages",
        json={"message": "I said it"},
        headers=auth(dad),
    ).json()

    assert second["agent"] == "elder"
    notes = [m for m in llm.requests[1]["messages"] if m["role"] == "system"]
    assert len(notes) == 1  # the note is not repeated every turn


def test_a_normal_conversation_is_unchanged(client: TestClient, make_user, llm: FakeLLM) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Hello."))

    turn = begin(client, dad, household_id, mode="normal").json()

    assert turn["agent"] == "sutradhar"


def test_the_elder_agent_cannot_show_forms_because_nobody_can_tap_them(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("ask_user", QUESTION)), text("Which version do you like to say?"))

    turn = begin(client, dad, household_id).json()

    assert turn["pending_card"] is None
    result = [m for m in llm.requests[1]["messages"] if m["role"] == "user"][-1]["content"][0]
    assert result["is_error"] is True
    assert "may not use" in result["content"]
    assert "ask_user" not in AGENTS["elder"].tools


def test_the_elder_agent_can_play_music(client: TestClient, make_user, llm: FakeLLM) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("play_music", {"query": "Hanuman Chalisa"})), text("Playing it now, ji."))

    turn = begin(client, dad, household_id, message="play hanuman chalisa").json()

    assert any(i["type"] == "card" and i["card"]["kind"] == "links" for i in turn["items"])


def test_an_unknown_mode_is_refused(client: TestClient, make_user, llm: FakeLLM) -> None:
    dad, _, household_id = setup_household(client, make_user)

    assert begin(client, dad, household_id, mode="chaos").status_code == 422


# --------------------------------------- a line in an Indian language is never followed by English


@pytest.mark.parametrize(
    ("said", "spoken"),
    [
        # An English rendering in brackets is dropped.
        ("श्रीगुरु चरन सरोज रज (Having cleaned the mirror of my mind)", "श्रीगुरु चरन सरोज रज"),
        ("जय हनुमान ज्ञान गुन सागर [Victory to Hanuman, ocean of wisdom]", "जय हनुमान ज्ञान गुन सागर"),
        # An English sentence of its own, after the line, is dropped.
        (
            "जय हनुमान ज्ञान गुन सागर। Victory to Hanuman, the ocean of wisdom.",
            "जय हनुमान ज्ञान गुन सागर।",
        ),
        ("ನಮಸ್ಕಾರ ಇವತ್ತು ಏನು ಮಾಡೋಣ?\nHello, what shall we do today?", "ನಮಸ್ಕಾರ ಇವತ್ತು ಏನು ಮಾಡೋಣ?"),
        # An English word inside an Indian-language sentence stays (a name or a title).
        ("आज हम Diwali की पूजा करेंगे।", "आज हम Diwali की पूजा करेंगे।"),
    ],
)
def test_the_english_version_beside_an_indian_language_line_is_not_read(
    said: str, spoken: str
) -> None:
    assert native_only(said) == spoken


@pytest.mark.parametrize(
    "text",
    [
        "Namaste ji. Tell me, how can I help you today?",  # plain English is left alone
        "Hanuman Chalisa (Forty verses to Hanuman)",
        "OK.",
        "",
        "जी।",  # too short to be a line worth protecting
    ],
)
def test_plain_english_and_very_short_text_are_left_exactly_as_they_are(text: str) -> None:
    assert native_only(text) == text


def test_something_is_always_spoken_even_if_filtering_would_leave_nothing() -> None:
    # Every sentence here is English except a tiny Indic fragment: the filter must not return "".
    assert native_only("Hello there friend (नमस्ते जी आप कैसे हैं)").strip() != ""
    only_aside = "(Having cleaned the mirror) जय हनुमान ज्ञान गुन सागर"
    assert native_only(only_aside) == "जय हनुमान ज्ञान गुन सागर"


def test_the_speak_route_applies_it(client: TestClient, make_user, voice: FakeVoice) -> None:
    dad, _, household_id = setup_household(client, make_user)

    speak(
        client,
        dad,
        household_id,
        text="जय हनुमान ज्ञान गुन सागर। Victory to Hanuman, the ocean of wisdom.",
    )

    assert voice.calls[-1]["text"] == "जय हनुमान ज्ञान गुन सागर।"


# ------------------------------------------------ recite mode: practice only, no meanings


def test_recite_mode_forbids_meanings_and_english_in_its_own_words() -> None:
    from festiveos.ai.prompts import playbook

    text = playbook("recite")
    assert "Never give a meaning, translation, explanation" in text
    assert "Never add an English version" in text
    assert "offer the meaning" not in " ".join(text.split())  # the old offer of a meaning is gone
    assert "offer its meaning" not in text
    assert "Never say two lines in one turn" in text
    assert "Never repeat what you said in another language" in playbook("elder")
