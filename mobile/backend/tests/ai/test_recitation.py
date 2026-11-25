import pytest
from fastapi.testclient import TestClient

from festiveos.ai.agents import AGENTS
from festiveos.ai.prompts import playbook
from festiveos.ai.recitation import compare, fold, words
from tests.ai.conftest import FakeLLM, text, use
from tests.support import API, auth, setup_household

LINE = "श्रीगुरु चरन सरोज रज, निज मनु मुकुरु सुधारि।"


def test_a_perfect_recitation_is_correct_whatever_the_punctuation() -> None:
    result = compare(LINE, "श्रीगुरु चरन सरोज रज निज मनु मुकुरु सुधारि")

    assert (result.verdict, result.score) == ("correct", 1.0)
    assert result.missing == []
    assert result.different == []
    assert result.extra == []


def test_a_swapped_word_is_named_exactly() -> None:
    result = compare(LINE, "श्रीगुरु चरन कमल रज निज मनु मुकुरु सुधारि")

    assert result.verdict == "close"
    assert [(d.expected, d.heard) for d in result.different] == [("सरोज", "कमल")]
    assert result.missing == []


def test_a_dropped_word_is_named_exactly() -> None:
    result = compare(LINE, "श्रीगुरु चरन सरोज निज मनु मुकुरु सुधारि")

    assert result.verdict == "close"
    assert result.missing == ["रज"]


def test_an_added_word_is_reported_and_stops_it_being_perfect() -> None:
    result = compare(LINE, "श्रीगुरु चरन सरोज रज निज मनु मुकुरु सुधारि जी")

    assert result.extra == ["जी"]
    assert result.verdict != "correct"


@pytest.mark.parametrize(
    ("expected", "heard"),
    [
        ("बरनऊँ रघुबर बिमल जसु", "बरनउ रघुबर बिमल जसू"),  # nasal mark and vowel length
        ("शिव ऋषि", "सिव ऋसि"),  # sibilants a recogniser uses interchangeably
        ("Om bhur bhuvah svah", "om bhoor bhuvah swaha"),  # Roman spellings of the same sounds
        ("اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ", "الله لا اله الا هو"),  # with and without vowel marks
        ("ಓಂ ನಮಃ ಶಿವಾಯ", "ಓಂ ನಮಃ ಶಿವಾಯ"),
    ],
)
def test_spelling_that_sounds_the_same_is_never_called_a_mistake(expected, heard) -> None:
    assert compare(expected, heard).verdict == "correct"


def test_unrelated_speech_is_unclear_not_a_wall_of_corrections() -> None:
    result = compare("बरनऊँ रघुबर बिमल जसु", "आज मौसम अच्छा है")

    assert result.verdict == "unclear"


def test_silence_and_a_missing_line_are_handled() -> None:
    assert compare(LINE, "").verdict == "unclear"
    assert compare(LINE, "  ।  ").verdict == "unclear"
    assert compare("", "anything").verdict == "unclear"


def test_a_line_and_a_reply_in_different_scripts_cannot_be_judged() -> None:
    result = compare("Om namah shivaya", "ॐ नमः शिवाय")

    assert result.verdict == "unclear"
    assert "script" in (result.note or "")


def test_the_comparison_is_bounded_so_a_huge_input_cannot_hang_the_server() -> None:
    long = " ".join(["word"] * 5000)

    assert compare(long, long).score == 1.0
    assert len(words(long)) == 80


def test_folding_changes_sound_alike_spellings_only() -> None:
    assert fold("जसू") == fold("जसु")
    assert fold("सरोज") != fold("कमल")


# ------------------------------------------------------------------------------ the tool and mode


def begin(client, user, household_id, message="teach me the hanuman chalisa", mode="recite"):
    return client.post(
        f"{API}/households/{household_id}/ai/conversations",
        json={"message": message, "mode": mode},
        headers=auth(user),
    )


def tool_result(llm: FakeLLM, request: int = 1) -> dict:
    return [m for m in llm.requests[request]["messages"] if m["role"] == "user"][-1]["content"][0]


def test_recite_mode_starts_the_recite_agent_with_its_instructions(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Let us begin."))

    turn = begin(client, dad, household_id).json()

    assert turn["agent"] == "recite"
    notes = [m["content"] for m in llm.requests[0]["messages"] if m["role"] == "system"]
    assert notes == [playbook("recite")]
    assert "check_recitation" in notes[0]


def test_what_the_person_said_is_checked_by_the_tool_and_the_result_reaches_the_model(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(
        use(("check_recitation", {"expected": LINE, "heard": "श्रीगुरु चरन कमल रज निज मनु मुकुरु सुधारि"})),
        text("Very close ji. Say सरोज, not कमल."),
    )

    turn = begin(client, dad, household_id, message="श्रीगुरु चरन कमल रज निज मनु मुकुरु सुधारि").json()

    assert "सरोज" in turn["items"][0]["text"]
    result = tool_result(llm)
    assert "is_error" not in result
    assert '"verdict": "close"' in result["content"]
    assert '"expected": "सरोज"' in result["content"]
    assert '"heard": "कमल"' in result["content"]


@pytest.mark.parametrize(
    "bad",
    [
        {},
        {"expected": ""},
        {"expected": "x" * 601, "heard": "y"},
        {"expected": "a", "heard": "y" * 601},
    ],
)
def test_bad_checks_are_errors_the_model_can_read(
    client: TestClient, make_user, llm: FakeLLM, bad
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("check_recitation", bad)), text("Sorry, let me try that again."))

    turn = begin(client, dad, household_id)

    assert turn.status_code == 201
    assert tool_result(llm)["is_error"] is True


def test_a_recite_conversation_stays_in_recite_mode_and_cannot_show_forms(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Say this line."), text("Wonderful."))
    first = begin(client, dad, household_id).json()

    second = client.post(
        f"{API}/ai/conversations/{first['conversation_id']}/messages",
        json={"message": "done"},
        headers=auth(dad),
    ).json()

    assert second["agent"] == "recite"
    assert "ask_user" not in AGENTS["recite"].tools
    assert "propose_action" not in AGENTS["recite"].tools


def test_the_normal_assistant_can_hand_off_to_practise_and_elder_mode_can_check_too(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(
        use(("handoff", {"agent": "recite", "brief": "Hanuman Chalisa in Hindi"})),
        text("Shall we begin?"),
    )

    turn = begin(
        client, dad, household_id, message="I want to learn the hanuman chalisa", mode="normal"
    ).json()

    assert turn["agent"] == "recite"
    assert "check_recitation" in AGENTS["elder"].tools
