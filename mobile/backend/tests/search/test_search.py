from fastapi.testclient import TestClient

from tests.expenses.test_expenses_api import add, expense_body
from tests.support import API, auth, create_festival, create_tradition, household_with


def search(client: TestClient, user, q: str):
    return client.get(f"{API}/search", params={"q": q}, headers=auth(user))


def kinds(response) -> set[str]:
    return {r["kind"] for r in response.json()["results"]}


def titles(response) -> list[str]:
    return [r["title"] for r in response.json()["results"]]


def test_search_finds_every_kind_within_the_users_groups(client: TestClient, make_user) -> None:
    dad, mom, _, household_id = household_with(client, make_user)
    create_festival(client, dad, household_id, name="Diwali at the farmhouse")
    create_tradition(client, dad, household_id, name="Diwali rangoli")
    add(client, dad, household_id, expense_body(dad, [dad, mom], description="Diwali sweets"))

    response = search(client, mom, "diwali")

    assert response.status_code == 200, response.text
    assert kinds(response) == {"festival", "tradition", "expense"}
    assert set(titles(response)) == {"Diwali at the farmhouse", "Diwali rangoli", "Diwali sweets"}
    assert {r["household_id"] for r in response.json()["results"]} == {household_id}


def test_search_matches_groups_and_people_case_insensitively(client: TestClient, make_user) -> None:
    dad, _, _, _ = household_with(client, make_user)

    group = search(client, dad, "RAJU")
    person = search(client, dad, "mom")

    assert "group" in kinds(group)
    assert "member" in kinds(person)


def test_search_never_returns_another_groups_data(client: TestClient, make_user) -> None:
    dad, _, _, household_id = household_with(client, make_user)
    create_festival(client, dad, household_id, name="Secret family festival")
    outsider = make_user("outsider@example.com")
    own = client.post(
        f"{API}/households", json={"name": "Chess club"}, headers=auth(outsider)
    ).json()["id"]
    create_festival(client, outsider, own, name="Chess festival")

    assert titles(search(client, outsider, "festival")) == ["Chess festival"]
    assert search(client, outsider, "secret").json()["results"] == []


def test_a_user_in_no_group_gets_an_empty_result(client: TestClient, make_user) -> None:
    loner = make_user("loner@example.com")

    assert search(client, loner, "anything").json()["results"] == []


def test_wildcards_in_the_query_are_plain_characters(client: TestClient, make_user) -> None:
    dad, _, _, household_id = household_with(client, make_user)
    create_festival(client, dad, household_id, name="Plain festival")
    create_festival(client, dad, household_id, name="100% fun festival")

    assert titles(search(client, dad, "0% ")) == ["100% fun festival"]  # a literal percent sign
    assert titles(search(client, dad, "%%")) == []  # not "match anything"
    assert titles(search(client, dad, "pl_in")) == []  # "_" is not a one-letter wildcard


def test_results_per_kind_are_capped(client: TestClient, make_user) -> None:
    dad, _, _, household_id = household_with(client, make_user)
    for n in range(8):
        create_festival(client, dad, household_id, name=f"Festival number {n}")

    results = search(client, dad, "festival number").json()["results"]

    assert len(results) == 5


def test_short_and_long_queries_are_rejected(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")

    assert search(client, dad, "a").status_code == 422
    assert search(client, dad, "x" * 61).status_code == 422
    assert client.get(f"{API}/search").status_code == 401


def test_search_costs_a_fixed_number_of_queries(client: TestClient, make_user, engine) -> None:
    from sqlalchemy import event

    dad, mom, _, household_id = household_with(client, make_user)
    for n in range(6):
        create_festival(client, dad, household_id, name=f"Festival {n}")
    statements: list[str] = []

    def record(conn, cursor, statement, *args):
        if not statement.lstrip().startswith("SET LOCAL"):
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", record)
    try:
        assert search(client, mom, "festival").status_code == 200
    finally:
        event.remove(engine, "before_cursor_execute", record)

    # auth session + user + the group list + one query for each of the five kinds
    assert len(statements) <= 9
