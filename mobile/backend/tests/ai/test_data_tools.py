"""Utsav answering questions about the group's own money, dates and traditions, and acting on them.

The numbers come from the server's own calculations, never from the model, and every change goes
through a confirmation card the person approves.
"""

import json

from fastapi.testclient import TestClient

from tests.ai.conftest import FakeLLM, text, use
from tests.ai.test_conversations import respond, start
from tests.support import API, auth, create_festival, create_tradition, setup_household


def tool_result(llm: FakeLLM) -> dict:
    """What the model was told by the last tool it called."""
    return json.loads(llm.requests[-1]["messages"][-1]["content"][0]["content"])


def add_expense(client, user, household_id, who, amount_minor, description="Sweets", **extra):
    body = {
        "description": description,
        "amount_minor": amount_minor,
        "paid_by": str(who.id),
        "split": {"type": "equal", "entries": [{"user_id": str(u.id)} for u in extra.pop("all")]},
        "category": extra.pop("category", "food"),
        "spent_on": "2026-11-20",
    }
    response = client.post(
        f"{API}/households/{household_id}/expenses", json=body, headers=auth(user)
    )
    assert response.status_code == 201, response.text
    return response.json()


# --------------------------------------------------------------------------------- spending


def test_money_questions_are_answered_from_the_servers_own_numbers(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, mom, household_id = setup_household(client, make_user)
    add_expense(client, dad, household_id, dad, 80_000, "Sweets", all=[dad, mom])
    add_expense(client, mom, household_id, mom, 20_000, "Cab", all=[dad, mom], category="travel")
    llm.will(use(("get_expenses", {})), text("You have spent a thousand rupees."))

    start(client, dad, household_id, "how much have we spent so far?")

    result = tool_result(llm)
    assert result["total"] == 1000.0
    assert result["count"] == 2
    assert result["by_category"] == {"food": 800.0, "travel": 200.0}
    assert result["settled_up"] is False
    # Dad paid 800 and mom 200 of 1000 split two ways: mom owes dad 300, by name.
    assert result["who_pays_whom"] == [{"from": mom.name, "to": "You", "amount": 300.0}]
    assert {e["what"] for e in result["recent"]} == {"Sweets", "Cab"}


def test_a_festivals_spending_can_be_asked_about_by_name(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("get_expenses", {"festival_name": "Nonexistent Festival"})), text("None found."))

    start(client, dad, household_id, "what did we spend on a festival that does not exist?")

    assert "No festival called" in tool_result(llm)["error"]


def test_no_spending_yet_is_a_clear_zero_not_an_error(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("get_expenses", {})), text("Nothing spent yet."))

    start(client, dad, household_id, "how much have we spent?")

    result = tool_result(llm)
    assert result["total"] == 0
    assert result["recent"] == []
    assert result["settled_up"] is True


# --------------------------------------------------------------------------- adding expenses


def test_adding_an_expense_by_asking_needs_approval_then_records_it_for_everyone(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, mom, household_id = setup_household(client, make_user)
    proposal = {"description": "Diya and rangoli", "amount": 450.5, "category": "decor"}
    llm.will(use(("propose_action", {"kind": "add_expense", "params": proposal})))

    turn = start(client, dad, household_id, "add 450.50 for diyas and rangoli").json()

    card = turn["pending_card"]
    assert card["kind"] == "confirm"
    assert "450.50" in card["summary"]
    assert {d["label"]: d["value"] for d in card["details"]}["Split"].startswith("Equally")
    listing = f"{API}/households/{household_id}/expenses"
    assert client.get(listing, headers=auth(dad)).json() == []  # nothing yet: only a proposal

    llm.will(text("Added."))
    assert respond(client, dad, turn, decision="approve").status_code == 200

    saved = client.get(listing, headers=auth(dad)).json()
    assert [(e["description"], e["amount_minor"], e["category"]) for e in saved] == [
        ("Diya and rangoli", 45_050, "decor")
    ]
    assert saved[0]["paid_by"] == str(
        dad.id
    )  # the person who approved, never anyone the model named
    assert {s["user_id"] for s in saved[0]["shares"]} == {str(dad.id), str(mom.id)}


def test_declining_an_expense_proposal_records_nothing(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(
        use(
            (
                "propose_action",
                {"kind": "add_expense", "params": {"description": "Gift", "amount": 999}},
            )
        )
    )
    turn = start(client, dad, household_id, "add 999 for a gift").json()
    llm.will(text("Okay, not added."))

    respond(client, dad, turn, decision="decline")

    assert client.get(f"{API}/households/{household_id}/expenses", headers=auth(dad)).json() == []


def test_an_expense_proposal_cannot_name_a_payer_or_smuggle_extra_fields(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, mom, household_id = setup_household(client, make_user)
    sneaky = {"description": "Gift", "amount": 100, "paid_by": str(mom.id)}
    llm.will(use(("propose_action", {"kind": "add_expense", "params": sneaky})), text("Sorry."))

    turn = start(client, dad, household_id, "add 100 paid by mom").json()

    assert turn["pending_card"] is None  # refused before any card was shown
    assert "error" in tool_result(llm)


def test_nonsense_amounts_are_refused_before_a_card_is_shown(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    for amount in (0, -50, 1e12):
        llm.will(
            use(
                (
                    "propose_action",
                    {"kind": "add_expense", "params": {"description": "x", "amount": amount}},
                )
            ),
            text("No."),
        )
        turn = start(client, dad, household_id, "add an expense").json()
        assert turn["pending_card"] is None


# ------------------------------------------------------------------------- dates and customs


def test_the_days_tithi_and_timings_come_from_the_panchang_engine(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("get_panchang", {"on": "2026-11-25", "city": "bengaluru"})), text("Pratipada."))

    start(client, dad, household_id, "what is the tithi today?")

    result = tool_result(llm)
    assert result["date"] == "2026-11-25"
    assert result["lunar"]["tithis"][0]["name"]
    assert result["sun_moon"]["sunrise"]


def test_traditions_are_listed_for_the_group(client: TestClient, make_user, llm: FakeLLM) -> None:
    dad, _, household_id = setup_household(client, make_user)
    festival = create_festival(client, dad, household_id)
    create_tradition(
        client, dad, household_id, name="Ajji's Mysore Pak", festival_type=festival["type"]
    )
    llm.will(use(("list_traditions", {})), text("You make Mysore Pak."))

    start(client, dad, household_id, "what are our traditions?")

    names = [t["name"] for t in tool_result(llm)["traditions"]]
    assert "Ajji's Mysore Pak" in names


# ----------------------------------------------------------------------------- opening screens


def test_asking_to_open_a_screen_shows_a_button_that_opens_it_only_when_tapped(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("navigate", {"screen": "expenses"})), text("Here is a button for your expenses."))

    turn = start(client, dad, household_id, "show me my expenses").json()

    card = next(i["card"] for i in turn["items"] if i["type"] == "card")
    assert card == {
        "kind": "navigate",
        "id": card["id"],
        "title": "Open Expenses",
        "screen": "expenses",
    }


def test_a_screen_that_does_not_exist_is_refused(
    client: TestClient, make_user, llm: FakeLLM
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    llm.will(use(("navigate", {"screen": "../../admin"})), text("I cannot open that."))

    turn = start(client, dad, household_id, "open the admin panel").json()

    assert not any(i["type"] == "card" for i in turn["items"])
    assert "error" in tool_result(llm)
