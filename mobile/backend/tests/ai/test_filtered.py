from fastapi.testclient import TestClient

from festiveos.ai.llm import parse_response
from festiveos.ai.orchestrator import FILTER_NUDGE, FILTERED, MAX_CONTINUATIONS
from tests.ai.conftest import FakeLLM, text
from tests.ai.test_streaming import parse, stream_start
from tests.support import API, auth, setup_household

PARTIAL = "Jai Hanuman gyan gun sagar\nJai Kapis tihun lok ujagar\nRam doot atulit bal dhama"


def on_screen(events) -> dict[int, str]:
    """The streamed text per segment after applying resets, like the app's reducer does."""
    segments: dict[int, str] = {}
    for name, data in events:
        if name == "reset":
            segments.pop(data["segment"], None)
        elif name == "text":
            segments[data["segment"]] = segments.get(data["segment"], "") + data["text"]
    return segments


def ask(client, user, household_id, message="Can you recite hanuman chalisa"):
    return client.post(
        f"{API}/households/{household_id}/ai/conversations",
        json={"message": message},
        headers=auth(user),
    )


# ------------------------------------------------------------------------- reading the provider


def test_a_content_filter_cut_off_is_filtered_not_refused_and_keeps_the_text() -> None:
    response = parse_response(
        {
            "status": "incomplete",
            "incomplete_details": {"reason": "content_filter"},
            "output": [{"type": "message", "content": [{"type": "output_text", "text": PARTIAL}]}],
        },
        None,
    )

    assert response.stop_reason == "filtered"
    assert response.content == [{"type": "text", "text": PARTIAL}]


def test_only_the_models_own_refusal_is_a_refusal() -> None:
    refused = parse_response(
        {"output": [{"type": "message", "content": [{"type": "refusal", "refusal": "no"}]}]}, None
    )
    long = parse_response(
        {
            "status": "incomplete",
            "incomplete_details": {"reason": "max_output_tokens"},
            "output": [],
        },
        None,
    )

    assert refused.stop_reason == "refusal"
    assert long.stop_reason == "max_tokens"


# ----------------------------------------------------------------------- full texts, in parts

LINE_1 = "Jai Hanuman gyan gun sagar"
LINE_2 = "Jai Kapis tihun lok ujagar"
KEPT = f"{LINE_1}\n{LINE_2}"  # the half-written third line is dropped


def test_a_long_text_cut_off_by_the_filter_continues_and_arrives_whole(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(
        text(PARTIAL, stop="filtered"),
        text("Ram doot atulit bal dhama\nAnjani putra pavan sut nama"),
    )

    turn = ask(client, dad, household_id).json()

    assert [i["text"] for i in turn["items"]] == [
        f"{KEPT}\nRam doot atulit bal dhama\nAnjani putra pavan sut nama"
    ]  # one answer, not two messages
    note = llm.requests[1]["messages"][-1]
    assert note["role"] == "system"
    assert LINE_2 in note["content"]  # it is told exactly where to carry on from
    assert "content filter" in note["content"]


def test_the_continue_note_is_never_stored_but_the_kept_text_is(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text(PARTIAL, stop="filtered"), text("The rest of it."), text("And the next thing."))
    turn = ask(client, dad, household_id).json()

    client.post(
        f"{API}/ai/conversations/{turn['conversation_id']}/messages",
        json={"message": "thank you"},
        headers=auth(dad),
    )

    later = llm.requests[2]["messages"]
    assert not any("content filter" in str(m["content"]) for m in later)
    assistant = [m["content"] for m in later if m["role"] == "assistant"]
    assert assistant[0] == [{"type": "text", "text": KEPT}]


def test_a_very_long_text_can_take_many_parts(client: TestClient, make_user, llm: FakeLLM) -> None:
    dad, _, household_id = setup_household(client, make_user)
    parts = [
        f"verse {n} line one is here today\nverse {n} line two follows it\nverse {n} cut"
        for n in range(5)
    ]
    llm.will(*[text(p, stop="filtered") for p in parts], text("verse 5 line one is the last part"))

    turn = ask(client, dad, household_id).json()

    assert len(turn["items"]) == 1
    body = turn["items"][0]["text"]
    assert body.startswith("verse 0 line one")
    assert body.endswith("the last part")
    assert body.count("line two") == 5
    assert "cut" not in body  # every half-written last line was dropped


def test_the_number_of_parts_is_capped_so_it_cannot_run_up_a_bill(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(*[text(PARTIAL, stop="filtered") for _ in range(MAX_CONTINUATIONS + 1)])

    turn = ask(client, dad, household_id).json()

    assert turn["items"][-1]["text"] == FILTERED
    assert len(llm.requests) == MAX_CONTINUATIONS + 1


# ------------------------------------------------------------- when nothing at all gets through


def test_when_nothing_usable_gets_through_it_is_retried_once_for_a_shorter_piece(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Jai", stop="filtered"), text("Here is the first verse, with its meaning."))

    turn = ask(client, dad, household_id).json()

    assert [i["text"] for i in turn["items"]] == ["Here is the first verse, with its meaning."]
    assert llm.requests[1]["messages"][-1] == {"role": "system", "content": FILTER_NUDGE}


def test_filtered_with_nothing_kept_twice_says_so_and_is_never_called_a_refusal(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Jai", stop="filtered"), text("", stop="filtered"))

    turn = ask(client, dad, household_id).json()

    assert [i["text"] for i in turn["items"]] == [FILTERED]
    assert "can't help" not in str(turn["items"])


# ------------------------------------------------------------------------------------ streaming


def test_a_streamed_long_text_replaces_the_cut_off_piece_and_carries_on(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text(PARTIAL, stop="filtered"), text("Ram doot atulit bal dhama"))

    events = parse(stream_start(client, dad, household_id, "recite hanuman chalisa in full").text)

    assert ("reset", {"segment": 1}) in events
    # What the screen ends up showing once it applies the reset, as the app does:
    assert on_screen(events) == {1: KEPT, 2: "Ram doot atulit bal dhama"}
    assert events[-1][1]["items"] == [
        {"type": "text", "text": f"{KEPT}\nRam doot atulit bal dhama"}
    ]
