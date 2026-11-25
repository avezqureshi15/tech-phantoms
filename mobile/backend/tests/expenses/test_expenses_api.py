import uuid

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import Engine

from tests.support import API, auth, create_festival, household_with

TODAY = "2026-11-24"


def expense_body(paid_by, people, amount=30000, **overrides) -> dict:
    return {
        "description": "Sweets and decorations",
        "amount_minor": amount,
        "paid_by": str(paid_by.id),
        "split": {"type": "equal", "entries": [{"user_id": str(p.id)} for p in people]},
        "category": "food",
        "spent_on": TODAY,
        **overrides,
    }


def add(client: TestClient, actor, household_id: str, body: dict):
    return client.post(f"{API}/households/{household_id}/expenses", json=body, headers=auth(actor))


def balances(client: TestClient, actor, household_id: str, **params) -> dict:
    response = client.get(
        f"{API}/households/{household_id}/balances", params=params, headers=auth(actor)
    )
    assert response.status_code == 200, response.text
    return response.json()


def net_of(report: dict) -> dict[str, int]:
    return {str(m["user_id"]): m["net_minor"] for m in report["members"]}


def test_an_equal_split_credits_the_payer_and_charges_everyone(
    client: TestClient, make_user
) -> None:
    dad, mom, son, household_id = household_with(client, make_user)

    created = add(client, dad, household_id, expense_body(dad, [dad, mom, son]))

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["currency"] == "INR"
    assert sorted(s["amount_minor"] for s in body["shares"]) == [10000, 10000, 10000]
    report = balances(client, mom, household_id)
    assert net_of(report) == {str(dad.id): 20000, str(mom.id): -10000, str(son.id): -10000}
    assert sum(net_of(report).values()) == 0
    assert report["settled_up"] is False
    assert {(t["payer"], t["payee"], t["amount_minor"]) for t in report["transfers"]} == {
        (str(mom.id), str(dad.id), 10000),
        (str(son.id), str(dad.id), 10000),
    }


def test_uneven_amounts_never_lose_a_paisa(client: TestClient, make_user) -> None:
    dad, mom, son, household_id = household_with(client, make_user)

    body = add(client, dad, household_id, expense_body(dad, [dad, mom, son], amount=10001)).json()

    assert sum(s["amount_minor"] for s in body["shares"]) == 10001
    assert sum(net_of(balances(client, dad, household_id)).values()) == 0


def test_exact_percent_and_shares_splits(client: TestClient, make_user) -> None:
    dad, mom, son, household_id = household_with(client, make_user)

    def split(kind, *values):
        entries = [
            {"user_id": str(p.id), "value": v} for p, v in zip((dad, mom, son), values, strict=True)
        ]
        return add(
            client,
            dad,
            household_id,
            expense_body(dad, [dad], amount=1000, split={"type": kind, "entries": entries}),
        )

    exact, percent, shares = (
        split("exact", 500, 300, 200),
        split("percent", 5000, 3000, 2000),
        split("shares", 5, 3, 2),
    )

    for response in (exact, percent, shares):
        assert [s["amount_minor"] for s in response.json()["shares"]] == [500, 300, 200]


def test_settling_up_zeroes_the_balances(client: TestClient, make_user) -> None:
    dad, mom, _son, household_id = household_with(client, make_user)
    add(client, dad, household_id, expense_body(dad, [dad, mom]))  # mom owes dad 15000

    paid = client.post(
        f"{API}/households/{household_id}/settlements",
        json={
            "payer": str(mom.id),
            "payee": str(dad.id),
            "amount_minor": 15000,
            "settled_on": TODAY,
        },
        headers=auth(mom),
    )

    assert paid.status_code == 201, paid.text
    report = balances(client, dad, household_id)
    assert report["settled_up"] is True
    assert report["transfers"] == []
    listed = client.get(f"{API}/households/{household_id}/settlements", headers=auth(dad)).json()
    assert [s["amount_minor"] for s in listed] == [15000]


def test_a_payment_can_only_be_recorded_by_those_involved_or_an_admin(client, make_user) -> None:
    dad, mom, son, household_id = household_with(client, make_user)
    url = f"{API}/households/{household_id}/settlements"
    body = {"payer": str(mom.id), "payee": str(dad.id), "amount_minor": 100, "settled_on": TODAY}

    by_son = client.post(url, json=body, headers=auth(son))
    by_admin = client.post(url, json=body, headers=auth(dad))
    to_self = client.post(url, json={**body, "payee": str(mom.id)}, headers=auth(mom))

    assert (by_son.status_code, by_admin.status_code, to_self.status_code) == (422, 201, 422)


def test_a_festival_has_its_own_expense_tracker(client: TestClient, make_user) -> None:
    dad, mom, son, household_id = household_with(client, make_user)
    diwali = create_festival(client, dad, household_id)
    add(
        client,
        dad,
        household_id,
        expense_body(dad, [dad, mom], amount=20000, festival_id=diwali["id"]),
    )
    add(client, mom, household_id, expense_body(mom, [dad, mom, son], amount=9000))

    only_diwali = client.get(
        f"{API}/households/{household_id}/expenses",
        params={"festival_id": diwali["id"]},
        headers=auth(dad),
    ).json()
    summary = client.get(
        f"{API}/households/{household_id}/expenses/summary",
        params={"festival_id": diwali["id"]},
        headers=auth(dad),
    ).json()
    everything = client.get(
        f"{API}/households/{household_id}/expenses/summary", headers=auth(dad)
    ).json()

    assert [e["amount_minor"] for e in only_diwali] == [20000]
    assert (summary["total_minor"], summary["count"]) == (20000, 1)
    assert (everything["total_minor"], everything["count"]) == (29000, 2)
    assert net_of(balances(client, dad, household_id, festival_id=diwali["id"])) == {
        str(dad.id): 10000,
        str(mom.id): -10000,
    }


def test_a_festival_from_another_group_is_refused(client: TestClient, make_user) -> None:
    dad, _mom, _son, household_id = household_with(client, make_user)
    other = client.post(f"{API}/households", json={"name": "Office"}, headers=auth(dad)).json()[
        "id"
    ]
    elsewhere = create_festival(client, dad, other)

    response = add(client, dad, household_id, expense_body(dad, [dad], festival_id=elsewhere["id"]))

    assert response.status_code == 404


def test_only_members_can_be_in_an_expense(client: TestClient, make_user) -> None:
    dad, _mom, _son, household_id = household_with(client, make_user)
    stranger = make_user("stranger@example.com")

    outsider_pays = add(client, dad, household_id, expense_body(stranger, [dad]))
    outsider_shares = add(client, dad, household_id, expense_body(dad, [dad, stranger]))

    assert (outsider_pays.status_code, outsider_shares.status_code) == (422, 422)


def test_bad_amounts_and_splits_are_rejected(client: TestClient, make_user) -> None:
    dad, _mom, _son, household_id = household_with(client, make_user)
    bad_exact = {"type": "exact", "entries": [{"user_id": str(dad.id), "value": 1}]}

    cases = [
        expense_body(dad, [dad], amount=0),
        expense_body(dad, [dad], amount=-5),
        expense_body(dad, [dad], description="   "),
        expense_body(dad, [dad], split=bad_exact),  # does not add up to the amount
        expense_body(dad, [dad], split={"type": "equal", "entries": []}),
        expense_body(dad, [dad], category="spaceships"),
    ]

    assert [add(client, dad, household_id, c).status_code for c in cases] == [422] * 6


def test_strangers_get_404_on_everything(client: TestClient, make_user) -> None:
    dad, mom, _son, household_id = household_with(client, make_user)
    stranger = make_user("stranger@example.com")
    expense = add(client, dad, household_id, expense_body(dad, [dad, mom])).json()
    base = f"{API}/households/{household_id}"

    statuses = [
        add(client, stranger, household_id, expense_body(stranger, [stranger])).status_code,
        client.get(f"{base}/expenses", headers=auth(stranger)).status_code,
        client.get(f"{base}/balances", headers=auth(stranger)).status_code,
        client.get(f"{base}/expenses/summary", headers=auth(stranger)).status_code,
        client.get(f"{API}/expenses/{expense['id']}", headers=auth(stranger)).status_code,
        client.delete(f"{API}/expenses/{expense['id']}", headers=auth(stranger)).status_code,
    ]

    assert statuses == [404] * 6


def test_only_the_author_or_an_admin_can_change_or_delete(client: TestClient, make_user) -> None:
    dad, mom, son, household_id = household_with(client, make_user)
    expense = add(client, mom, household_id, expense_body(mom, [dad, mom])).json()
    url = f"{API}/expenses/{expense['id']}"

    by_son = client.patch(url, json={"description": "Hacked"}, headers=auth(son))
    by_mom = client.patch(url, json={"description": "Sweets"}, headers=auth(mom))
    by_admin = client.delete(url, headers=auth(dad))

    assert (by_son.status_code, by_mom.status_code, by_admin.status_code) == (422, 200, 204)
    assert by_mom.json()["description"] == "Sweets"
    assert client.get(url, headers=auth(mom)).status_code == 404


def test_changing_the_amount_and_split_recomputes_every_share(
    client: TestClient, make_user
) -> None:
    dad, mom, son, household_id = household_with(client, make_user)
    expense = add(
        client, dad, household_id, expense_body(dad, [dad, mom, son], amount=30000)
    ).json()
    url = f"{API}/expenses/{expense['id']}"

    updated = client.patch(
        url,
        json={
            "amount_minor": 20000,
            "split": {
                "type": "equal",
                "entries": [{"user_id": str(dad.id)}, {"user_id": str(mom.id)}],
            },
        },
        headers=auth(dad),
    )
    half_change = client.patch(url, json={"amount_minor": 5}, headers=auth(dad))

    assert [s["amount_minor"] for s in updated.json()["shares"]] == [10000, 10000]
    assert half_change.status_code == 422  # the amount and the split change together
    assert net_of(balances(client, dad, household_id)) == {str(dad.id): 10000, str(mom.id): -10000}


def test_a_festival_can_be_unlinked_from_an_expense(client: TestClient, make_user) -> None:
    dad, _mom, _son, household_id = household_with(client, make_user)
    diwali = create_festival(client, dad, household_id)
    expense = add(
        client, dad, household_id, expense_body(dad, [dad], festival_id=diwali["id"])
    ).json()

    cleared = client.patch(
        f"{API}/expenses/{expense['id']}", json={"festival_id": None}, headers=auth(dad)
    )

    assert cleared.json()["festival_id"] is None


def test_listing_expenses_costs_the_same_number_of_queries_however_many(
    client, make_user, engine: Engine
) -> None:
    dad, mom, son, household_id = household_with(client, make_user)
    url = f"{API}/households/{household_id}/expenses"

    def queries() -> int:
        statements: list[str] = []

        def record(conn, cursor, statement, *args):
            if not statement.lstrip().startswith("SET LOCAL"):
                statements.append(statement)

        event.listen(engine, "before_cursor_execute", record)
        try:
            assert client.get(url, headers=auth(dad)).status_code == 200
        finally:
            event.remove(engine, "before_cursor_execute", record)
        return len(statements)

    add(client, dad, household_id, expense_body(dad, [dad, mom, son]))
    few = queries()
    for _ in range(8):
        add(client, dad, household_id, expense_body(dad, [dad, mom, son]))

    assert queries() == few


def test_deleting_the_payers_account_keeps_the_ledger_consistent(client, make_user) -> None:
    dad, mom, son, household_id = household_with(client, make_user)
    add(client, son, household_id, expense_body(son, [dad, mom, son], amount=30000))

    assert client.delete(f"{API}/users/me", headers=auth(son)).status_code == 204

    report = balances(client, dad, household_id)
    assert sum(net_of(report).values()) == 0  # the departed person's side is kept under None
    assert None in {m["user_id"] for m in report["members"]}
    expense = client.get(f"{API}/households/{household_id}/expenses", headers=auth(dad)).json()[0]
    assert expense["paid_by"] is None
    assert uuid.UUID(expense["id"])
