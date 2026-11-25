import uuid

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import Engine

from tests.support import API, auth, create_household, setup_household


def test_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get(f"{API}/households").status_code == 401
    assert client.post(f"{API}/households", json={"name": "x"}).status_code == 401


def test_creator_becomes_admin_member(client: TestClient, make_user) -> None:
    owner = make_user("dad@example.com")
    household_id = create_household(client, owner)

    body = client.get(f"{API}/households/{household_id}", headers=auth(owner)).json()

    assert body["created_by"] == str(owner.id)
    assert body["currency"] == "INR"
    assert [(m["user"]["id"], m["role"]) for m in body["members"]] == [(str(owner.id), "admin")]


def test_list_returns_only_my_households(client: TestClient, make_user) -> None:
    dad, stranger = make_user("dad@example.com"), make_user("x@example.com")
    mine = create_household(client, dad)
    create_household(client, stranger, name="Other")

    response = client.get(f"{API}/households", headers=auth(dad))

    assert [h["id"] for h in response.json()] == [mine]


def test_non_member_cannot_see_household(client: TestClient, make_user) -> None:
    household_id = create_household(client, make_user("dad@example.com"))
    stranger = make_user("x@example.com")

    response = client.get(f"{API}/households/{household_id}", headers=auth(stranger))

    assert response.status_code == 404


def test_create_household_rejects_unknown_timezone(client: TestClient, make_user) -> None:
    response = client.post(
        f"{API}/households",
        json={"name": "X", "timezone": "Mars/Base"},
        headers=auth(make_user("dad@example.com")),
    )

    assert response.status_code == 422


def test_admin_adds_member_by_email_and_duplicates_conflict(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")
    make_user("mom@example.com")
    household_id = create_household(client, dad)
    payload = {"email": "Mom@Example.com", "relationship": "MOTHER"}

    first = client.post(f"{API}/households/{household_id}/members", json=payload, headers=auth(dad))
    second = client.post(
        f"{API}/households/{household_id}/members", json=payload, headers=auth(dad)
    )

    assert first.status_code == 201
    assert first.json()["relationship"] == "MOTHER"
    assert second.status_code == 409


def test_add_member_unknown_email_is_404(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")
    household_id = create_household(client, dad)

    response = client.post(
        f"{API}/households/{household_id}/members",
        json={"email": "ghost@example.com"},
        headers=auth(dad),
    )

    assert response.status_code == 404


def test_non_admin_member_cannot_add_members(client: TestClient, make_user) -> None:
    dad, mom = make_user("dad@example.com"), make_user("mom@example.com")
    make_user("son@example.com")
    household_id = create_household(client, dad)
    client.post(
        f"{API}/households/{household_id}/members",
        json={"email": "mom@example.com"},
        headers=auth(dad),
    )

    response = client.post(
        f"{API}/households/{household_id}/members",
        json={"email": "son@example.com"},
        headers=auth(mom),
    )

    assert response.status_code == 403


def test_unknown_household_is_404(client: TestClient, make_user) -> None:
    response = client.get(
        f"{API}/households/{uuid.uuid4()}", headers=auth(make_user("a@example.com"))
    )

    assert response.status_code == 404


def test_get_household_query_count_does_not_grow_with_members(
    client: TestClient, engine: Engine, make_user
) -> None:
    dad = make_user("dad@example.com")
    household_id = create_household(client, dad)
    statements: list[str] = []

    @event.listens_for(engine, "before_cursor_execute")
    def count(_conn, _cursor, statement, *_):
        if not statement.startswith("SET LOCAL"):  # per-transaction setup, not a data query
            statements.append(statement)

    client.get(f"{API}/households/{household_id}", headers=auth(dad))
    queries_with_one_member = len(statements)

    for i in range(5):
        member = make_user(f"member{i}@example.com")
        client.post(
            f"{API}/households/{household_id}/members",
            json={"email": member.email},
            headers=auth(dad),
        )

    statements.clear()
    response = client.get(f"{API}/households/{household_id}", headers=auth(dad))

    assert len(response.json()["members"]) == 6
    assert len(statements) == queries_with_one_member


def test_admin_updates_household_settings_including_timezone(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")
    hid = create_household(client, dad)

    response = client.patch(
        f"{API}/households/{hid}",
        json={
            "name": "Sharma Family",
            "timezone": "America/Los_Angeles",
            "location": "San Jose, CA",
            "currency": "USD",
        },
        headers=auth(dad),
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["timezone"], body["location"], body["currency"]) == (
        "Sharma Family",
        "America/Los_Angeles",
        "San Jose, CA",
        "USD",
    )
    assert body["created_by"] == str(dad.id)
    assert (
        client.get(f"{API}/households/{hid}", headers=auth(dad)).json()["timezone"]
        == "America/Los_Angeles"
    )


def test_household_update_validation(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")
    hid = create_household(client, dad)
    url = f"{API}/households/{hid}"
    h = auth(dad)

    assert client.patch(url, json={"timezone": "Mars/Base"}, headers=h).status_code == 422
    assert client.patch(url, json={}, headers=h).status_code == 422
    assert client.patch(url, json={"name": None}, headers=h).status_code == 422
    assert client.patch(url, json={"timezone": None}, headers=h).status_code == 422
    assert client.patch(url, json={"name": "   "}, headers=h).status_code == 422
    assert client.patch(url, json={"currency": "inr"}, headers=h).status_code == 422
    assert client.patch(url, json={"created_by": str(dad.id)}, headers=h).status_code == 422
    cleared = client.patch(url, json={"location": None}, headers=h)
    assert cleared.status_code == 200
    assert cleared.json()["location"] is None


def test_only_admins_may_update_a_household(client: TestClient, make_user) -> None:
    dad, mom = make_user("dad@example.com"), make_user("mom@example.com")
    hid = create_household(client, dad)
    client.post(
        f"{API}/households/{hid}/members", json={"email": "mom@example.com"}, headers=auth(dad)
    )

    member = client.patch(f"{API}/households/{hid}", json={"name": "Mine now"}, headers=auth(mom))
    outsider = client.patch(
        f"{API}/households/{hid}", json={"name": "x"}, headers=auth(make_user("x@example.com"))
    )

    assert member.status_code == 403
    assert outsider.status_code == 404


def test_a_group_records_the_faiths_it_follows(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)

    updated = client.patch(
        f"{API}/households/{household_id}",
        json={"faiths": ["hindu", "muslim", "hindu"], "panchang_city": "mumbai"},
        headers=auth(dad),
    )

    assert updated.status_code == 200, updated.text
    assert updated.json()["faiths"] == ["hindu", "muslim"]  # duplicates dropped, order kept
    assert updated.json()["panchang_city"] == "mumbai"
    fetched = client.get(f"{API}/households/{household_id}", headers=auth(dad)).json()
    assert fetched["faiths"] == ["hindu", "muslim"]


def test_faiths_default_to_empty_and_reject_unknown_values(client: TestClient, make_user) -> None:
    dad, mom, household_id = setup_household(client, make_user)
    url = f"{API}/households/{household_id}"

    fresh = client.get(url, headers=auth(dad)).json()
    unknown = client.patch(url, json={"faiths": ["pastafarian"]}, headers=auth(dad))
    not_admin = client.patch(url, json={"faiths": ["sikh"]}, headers=auth(mom))
    bad_city = client.patch(url, json={"panchang_city": "Not A City!"}, headers=auth(dad))

    assert (fresh["faiths"], fresh["panchang_city"]) == ([], "delhi")
    assert [unknown.status_code, not_admin.status_code, bad_city.status_code] == [422, 403, 422]


def test_a_group_has_a_kind_an_icon_and_a_colour(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")

    created = client.post(
        f"{API}/households",
        json={"name": "Bengaluru gang", "kind": "friends", "icon": "emoji:🎉", "color": "#C2410C"},
        headers=auth(dad),
    )
    default = client.post(f"{API}/households", json={"name": "Home"}, headers=auth(dad))

    assert created.status_code == 201, created.text
    body = created.json()
    assert (body["kind"], body["icon"], body["color"]) == ("friends", "emoji:🎉", "#C2410C")
    assert (default.json()["kind"], default.json()["icon"]) == ("household", None)


def test_a_group_can_change_its_icon_and_colour(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)

    updated = client.patch(
        f"{API}/households/{household_id}",
        json={"icon": "symbol:flame", "color": "#1F5C3A"},
        headers=auth(dad),
    )

    assert (updated.json()["icon"], updated.json()["color"]) == ("symbol:flame", "#1F5C3A")


def test_bad_icons_kinds_and_colours_are_rejected(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")
    url = f"{API}/households"

    bad = [
        {"name": "x", "icon": "emoji:abc"},  # not an emoji
        {"name": "x", "icon": "<script>"},
        {"name": "x", "icon": "symbol:Not Valid"},
        {"name": "x", "kind": "cult"},
        {"name": "x", "color": "orange"},
    ]

    assert [client.post(url, json=b, headers=auth(dad)).status_code for b in bad] == [422] * 5


def test_traditions_are_only_for_household_groups(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")
    friends = client.post(
        f"{API}/households", json={"name": "Friends", "kind": "friends"}, headers=auth(dad)
    ).json()["id"]
    home = client.post(f"{API}/households", json={"name": "Home"}, headers=auth(dad)).json()["id"]
    body = {"name": "Evening aarti", "festival_type": "DIWALI", "category": "RITUAL"}

    refused = client.post(f"{API}/households/{friends}/traditions", json=body, headers=auth(dad))
    allowed = client.post(f"{API}/households/{home}/traditions", json=body, headers=auth(dad))

    assert refused.status_code == 422
    assert "household" in refused.json()["detail"]
    assert allowed.status_code == 201, allowed.text
