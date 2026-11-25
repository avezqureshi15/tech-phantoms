import contextlib
import itertools
import uuid

from fastapi.testclient import TestClient

from festiveos.ai.models import AIConversation
from tests.ai.conftest import FakeLLM, text, use
from tests.support import API, auth, setup_household

QUESTION = {
    "title": "A few details",
    "description": "So I can plan properly",
    "fields": [
        {"key": "adults", "label": "Adults", "type": "number", "minimum": 1, "maximum": 50},
        {"key": "elders", "label": "Elders (60+)", "type": "number", "minimum": 0, "maximum": 50},
        {
            "key": "diet",
            "label": "Diet",
            "type": "single_choice",
            "options": [{"value": "veg", "label": "Veg"}, {"value": "mixed", "label": "Mixed"}],
        },
    ],
}
HOSTING = {
    "adults": 3,
    "children": 0,
    "elders": 1,
    "meal": "dinner",
    "diet": "veg",
}


def start(client, user, household_id, message="I want to host 3 people for dinner"):
    return client.post(
        f"{API}/households/{household_id}/ai/conversations",
        json={"message": message},
        headers=auth(user),
    )


def respond(client, user, turn: dict, **body):
    card = turn["pending_card"]
    return client.post(
        f"{API}/ai/conversations/{turn['conversation_id']}/cards/{card['id']}/response",
        json=body,
        headers=auth(user),
    )


def cards(turn: dict, kind: str) -> list[dict]:
    return [i["card"] for i in turn["items"] if i["type"] == "card" and i["card"]["kind"] == kind]


def test_hosting_three_people_asks_a_card_then_plans_with_jugaad(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(
        use(("handoff", {"agent": "requirements", "brief": "host 3 for dinner"})),
        use(("get_household_context", {}), ("list_inventory", {})),
        use(("ask_user", QUESTION)),
    )

    first = start(client, dad, household_id)

    assert first.status_code == 201, first.text
    turn = first.json()
    assert turn["agent"] == "requirements"
    assert turn["pending_card"]["kind"] == "question"
    assert [f["key"] for f in turn["pending_card"]["fields"]] == ["adults", "elders", "diet"]

    llm.will(
        use(("handoff", {"agent": "planner", "brief": "3 adults, 1 elder, veg dinner"})),
        use(("calculate_hosting", {**HOSTING, "chairs_available": 1})),
        use(("handoff", {"agent": "jugaad", "brief": "short of chairs"})),
        use(("jugaad_options", {"shortfall_seats": 3, "elders_without_chair": 0, "children": 0})),
        text("Borrow two chairs from a neighbour and spread a dari for the rest."),
    )
    answered = respond(client, dad, turn, answers={"adults": 3, "elders": 1, "diet": "veg"})

    assert answered.status_code == 200, answered.text
    done = answered.json()
    assert done["pending_card"] is None
    assert done["agent"] == "jugaad"
    plan = cards(done, "hosting_plan")[0]
    assert "short of seating by 3" in plan["headline"]
    seating = next(s for s in plan["sections"] if s["heading"] == "Seating")
    assert {"label": "Short by", "value": "3"} in seating["lines"]
    assert done["items"][-1] == {
        "type": "text",
        "text": "Borrow two chairs from a neighbour and spread a dari for the rest.",
    }


def test_the_answer_reaches_the_model_as_the_tool_result(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("ask_user", QUESTION)))
    turn = start(client, dad, household_id).json()
    llm.will(text("Noted."))

    respond(client, dad, turn, answers={"adults": 3, "elders": 0, "diet": "mixed"})

    last = llm.requests[-1]["messages"][-1]
    result = last["content"][0]
    assert result["type"] == "tool_result"
    assert '"adults": 3' in result["content"]
    assert '"mixed"' in result["content"]


def test_history_is_append_only_so_the_prompt_prefix_never_changes(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(
        use(("handoff", {"agent": "requirements", "brief": "x"})),
        use(("ask_user", QUESTION)),
    )
    turn = start(client, dad, household_id).json()
    llm.will(text("Thanks, that is all I need."))
    respond(client, dad, turn, answers={"adults": 2, "elders": 0, "diet": "veg"})
    llm.will(text("You are welcome."))
    client.post(
        f"{API}/ai/conversations/{turn['conversation_id']}/messages",
        json={"message": "thanks!"},
        headers=auth(dad),
    )

    requests = llm.requests
    assert len(requests) == 4
    for earlier, later in itertools.pairwise(requests):
        assert later["system"] == earlier["system"]
        assert later["tools"] == earlier["tools"]
        assert later["messages"][: len(earlier["messages"])] == earlier["messages"]


def test_a_write_needs_approval_and_nothing_happens_before_it(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    chairs = {"name": "Folding chairs", "category": "seating", "quantity": 4}
    llm.will(use(("propose_action", {"kind": "add_inventory_item", "params": chairs})))

    turn = start(client, dad, household_id, "I have 4 folding chairs").json()

    confirm = turn["pending_card"]
    assert confirm["kind"] == "confirm"
    assert confirm["summary"] == "Add 4 x Folding chairs to the household inventory."
    inventory = f"{API}/households/{household_id}/inventory"
    assert client.get(inventory, headers=auth(dad)).json() == []

    llm.will(text("Added."))
    approved = respond(client, dad, turn, decision="approve")

    assert approved.status_code == 200
    listed = client.get(inventory, headers=auth(dad)).json()
    assert [(i["name"], i["quantity"]) for i in listed] == [("Folding chairs", 4)]
    assert '"status": "done"' in llm.requests[-1]["messages"][-1]["content"][0]["content"]


def test_declining_changes_nothing_and_the_model_is_told(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    chairs = {"name": "Chairs", "category": "seating", "quantity": 4}
    llm.will(use(("propose_action", {"kind": "add_inventory_item", "params": chairs})))
    turn = start(client, dad, household_id).json()
    llm.will(text("No problem."))

    respond(client, dad, turn, decision="decline")

    inventory = client.get(f"{API}/households/{household_id}/inventory", headers=auth(dad))
    assert inventory.json() == []
    assert "declined_by_user" in llm.requests[-1]["messages"][-1]["content"][0]["content"]


def test_an_approved_action_runs_with_the_approvers_permissions(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    _, mom, household_id = setup_household(client, make_user)  # mom is not an admin
    festival = {
        "type": "DIWALI",
        "name": "Diwali",
        "start_date": "2026-11-08",
        "end_date": "2026-11-12",
    }
    llm.will(use(("propose_action", {"kind": "create_festival", "params": festival})))
    turn = start(client, mom, household_id).json()
    llm.will(text("I could not do that."))

    respond(client, mom, turn, decision="approve")

    assert "not made" in llm.requests[-1]["messages"][-1]["content"][0]["content"]
    listed = client.get(f"{API}/households/{household_id}/festivals", headers=auth(mom))
    assert listed.json() == []


def test_invalid_answers_are_rejected_and_the_card_stays_open(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("ask_user", QUESTION)))
    turn = start(client, dad, household_id).json()

    bad = respond(client, dad, turn, answers={"adults": 3, "elders": 0, "diet": "keto"})
    llm.will(text("Great."))
    ok = respond(client, dad, turn, answers={"adults": 3, "elders": 0, "diet": "veg"})

    assert bad.status_code == 422
    assert ok.status_code == 200
    again = respond(client, dad, turn, answers={"adults": 3, "elders": 0, "diet": "veg"})
    assert again.status_code == 409


def test_a_new_message_is_refused_while_a_card_is_waiting(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("ask_user", QUESTION)))
    turn = start(client, dad, household_id).json()

    response = client.post(
        f"{API}/ai/conversations/{turn['conversation_id']}/messages",
        json={"message": "never mind"},
        headers=auth(dad),
    )

    assert response.status_code == 409


def test_an_agent_cannot_use_a_tool_it_was_not_given(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("calculate_hosting", {**HOSTING})), text("Sorry."))  # sutradhar may not

    start(client, dad, household_id)

    result = llm.requests[-1]["messages"][-1]["content"][0]
    assert result["is_error"] is True
    assert "may not use" in result["content"]


def test_two_cards_in_one_model_message_only_show_the_first(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("get_household_context", {}), ("ask_user", QUESTION), ("ask_user", QUESTION)))

    turn = start(client, dad, household_id).json()
    llm.will(text("ok"))
    respond(client, dad, turn, answers={"adults": 1, "elders": 0, "diet": "veg"})

    results = llm.requests[-1]["messages"][-1]["content"]
    assert [r["tool_use_id"] for r in results] == [
        b["id"] for b in llm.requests[-1]["messages"][-2]["content"] if b["type"] == "tool_use"
    ]
    assert results[2].get("is_error") is True


def test_the_slash_jugaad_skill_starts_at_the_jugaad_agent(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("Here are some ideas."))

    turn = start(client, dad, household_id, "/jugaad not enough chairs for 8").json()

    messages = llm.requests[0]["messages"]
    assert messages[0]["content"][0]["text"] == "not enough chairs for 8"
    assert messages[1]["role"] == "system"
    assert "JUGAAD agent" in messages[1]["content"]
    assert turn["agent"] == "jugaad"


def test_a_refusal_becomes_a_notice_and_the_chat_continues(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("", stop="refusal"))
    turn = start(client, dad, household_id).json()
    llm.will(text("Happy to help with Diwali."))

    follow_up = client.post(
        f"{API}/ai/conversations/{turn['conversation_id']}/messages",
        json={"message": "plan diwali"},
        headers=auth(dad),
    )

    assert "can't help" in turn["items"][0]["text"]
    assert follow_up.status_code == 200
    assert all(m["content"] != [] for m in llm.requests[-1]["messages"])


def test_a_model_that_never_stops_calling_tools_is_cut_off(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(*[use(("list_festivals", {})) for _ in range(8)])

    turn = start(client, dad, household_id).json()

    assert len(llm.requests) == 8
    assert "tangled" in turn["items"][-1]["text"]


def test_a_conversation_is_private_to_its_owner(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, mom, household_id = setup_household(client, make_user)
    stranger = make_user("stranger@example.com")
    llm.will(use(("ask_user", QUESTION)))
    turn = start(client, dad, household_id).json()
    url = f"{API}/ai/conversations/{turn['conversation_id']}"
    card_url = f"{url}/cards/{turn['pending_card']['id']}/response"
    body = {"answers": {"adults": 1, "elders": 0, "diet": "veg"}}

    statuses = [
        client.get(url, headers=auth(mom)).status_code,
        client.get(url, headers=auth(stranger)).status_code,
        client.post(card_url, json=body, headers=auth(mom)).status_code,
        client.post(f"{url}/messages", json={"message": "hi"}, headers=auth(mom)).status_code,
        client.delete(url, headers=auth(stranger)).status_code,
        start(client, stranger, household_id).status_code,
    ]

    assert statuses == [404] * 6


def test_a_busy_conversation_answers_409_instead_of_running_twice(
    client: TestClient, make_user, llm: FakeLLM, session_factory
) -> None:
    from datetime import UTC, datetime

    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("hello"))
    turn = start(client, dad, household_id).json()
    with session_factory() as session:
        session.get(
            AIConversation, uuid.UUID(turn["conversation_id"])
        ).turn_started_at = datetime.now(UTC)
        session.commit()

    response = client.post(
        f"{API}/ai/conversations/{turn['conversation_id']}/messages",
        json={"message": "again"},
        headers=auth(dad),
    )

    assert response.status_code == 409
    assert len(llm.requests) == 1


def test_a_failed_model_call_frees_the_conversation(
    client: TestClient, make_user, llm: FakeLLM, session_factory
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(text("first"))
    turn = start(client, dad, household_id).json()

    # No script left: the fake raises, standing in for a provider outage.
    with contextlib.suppress(AssertionError):
        client.post(
            f"{API}/ai/conversations/{turn['conversation_id']}/messages",
            json={"message": "second"},
            headers=auth(dad),
        )
    llm.will(text("third"))
    retry = client.post(
        f"{API}/ai/conversations/{turn['conversation_id']}/messages",
        json={"message": "third"},
        headers=auth(dad),
    )

    assert retry.status_code == 200


def test_ai_is_unavailable_without_a_provider_credential(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)

    response = start(client, dad, household_id)

    assert response.status_code == 503
    assert "api" not in response.text.lower()


def test_the_transcript_can_be_read_back_with_its_open_card(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("ask_user", QUESTION), lead="Let me ask a few things."))
    turn = start(client, dad, household_id).json()

    detail = client.get(
        f"{API}/ai/conversations/{turn['conversation_id']}", headers=auth(dad)
    ).json()
    listing = client.get(
        f"{API}/households/{household_id}/ai/conversations", headers=auth(dad)
    ).json()

    assert detail["pending_card"]["id"] == turn["pending_card"]["id"]
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
    assert detail["messages"][1]["items"][0]["text"] == "Let me ask a few things."
    assert [c["id"] for c in listing] == [turn["conversation_id"]]
    assert (
        client.delete(
            f"{API}/ai/conversations/{turn['conversation_id']}", headers=auth(dad)
        ).status_code
        == 204
    )


def test_installed_skills_are_listed_for_the_chat_menu(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")

    response = client.get(f"{API}/ai/skills", headers=auth(dad))

    assert response.status_code == 200
    assert [s["command"] for s in response.json()] == ["/jugaad"]
    assert client.get(f"{API}/ai/skills").status_code == 401


def test_slash_commands_are_case_insensitive_and_unknown_ones_are_plain_text() -> None:
    from festiveos.ai.agents import parse_skill

    assert parse_skill("/JUGAAD need chairs") == ("jugaad", "need chairs")
    assert parse_skill("/unknown hello") == (None, "/unknown hello")
    assert parse_skill("plain message") == (None, "plain message")
