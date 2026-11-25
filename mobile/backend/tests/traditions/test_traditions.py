from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import Engine

from tests.support import API, FIRST_DIYA, auth, create_festival, create_tradition, setup_household


def test_any_member_can_create_and_list_traditions(client: TestClient, make_user) -> None:
    _, mom, household_id = setup_household(client, make_user)

    created = create_tradition(client, mom, household_id)
    create_tradition(client, mom, household_id, name="Chakli", category="FOOD")
    create_tradition(client, mom, household_id, name="Tree", festival_type="CHRISTMAS")
    listing = client.get(
        f"{API}/households/{household_id}/traditions",
        params={"festival_type": "DIWALI"},
        headers=auth(mom),
    ).json()

    assert created["created_by"] == str(mom.id)
    assert [t["name"] for t in listing] == ["Chakli", "First Diya"]


def test_tradition_validation(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    url = f"{API}/households/{household_id}/traditions"

    bad_category = client.post(url, json={**FIRST_DIYA, "category": "NOPE"}, headers=auth(dad))
    future_year = client.post(url, json={**FIRST_DIYA, "started_year": 9999}, headers=auth(dad))

    assert bad_category.status_code == 422
    assert future_year.status_code == 422


def test_only_creator_or_admin_can_edit(client: TestClient, make_user) -> None:
    dad, mom, household_id = setup_household(client, make_user)
    son = make_user("son@example.com")
    client.post(
        f"{API}/households/{household_id}/members", json={"email": son.email}, headers=auth(dad)
    )
    tradition = create_tradition(client, mom, household_id)
    url = f"{API}/traditions/{tradition['id']}"

    by_other_member = client.patch(url, json={"name": "x"}, headers=auth(son))
    by_creator = client.patch(url, json={"active": False}, headers=auth(mom))
    by_admin = client.patch(url, json={"name": "Renamed"}, headers=auth(dad))

    assert by_other_member.status_code == 403
    assert by_creator.json()["active"] is False
    assert by_admin.json()["name"] == "Renamed"


def test_outsider_cannot_read_tradition(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    tradition = create_tradition(client, dad, household_id)

    response = client.get(
        f"{API}/traditions/{tradition['id']}", headers=auth(make_user("x@example.com"))
    )

    assert response.status_code == 404


def test_occurrences_build_history_and_reject_duplicates(client: TestClient, make_user) -> None:
    dad, mom, household_id = setup_household(client, make_user)
    tradition = create_tradition(client, dad, household_id)
    y2025 = create_festival(
        client,
        dad,
        household_id,
        name="Diwali 2025",
        start_date="2025-10-20",
        end_date="2025-10-24",
    )
    y2026 = create_festival(client, dad, household_id)
    url = f"{API}/traditions/{tradition['id']}/occurrences"

    first = client.post(
        url,
        json={"festival_id": y2025["id"], "performed_by": str(dad.id), "notes": "Lit at 7:30"},
        headers=auth(mom),
    )
    client.post(
        url, json={"festival_id": y2026["id"], "performed_by": str(mom.id)}, headers=auth(dad)
    )
    duplicate = client.post(url, json={"festival_id": y2026["id"]}, headers=auth(dad))
    detail = client.get(f"{API}/traditions/{tradition['id']}", headers=auth(dad)).json()

    assert first.status_code == 201
    assert first.json()["year"] == 2025
    assert first.json()["performer"]["name"] == "dad"
    assert duplicate.status_code == 409
    assert sorted(o["year"] for o in detail["occurrences"]) == [2025, 2026]


def test_occurrence_rejects_foreign_festival_and_non_member_performer(
    client: TestClient, make_user
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    other_owner = make_user("other@example.com")
    other_household = client.post(
        f"{API}/households", json={"name": "Other"}, headers=auth(other_owner)
    ).json()["id"]
    foreign_festival = create_festival(client, other_owner, other_household)
    own_festival = create_festival(client, dad, household_id)
    tradition = create_tradition(client, dad, household_id)
    url = f"{API}/traditions/{tradition['id']}/occurrences"

    foreign = client.post(url, json={"festival_id": foreign_festival["id"]}, headers=auth(dad))
    outsider = client.post(
        url,
        json={"festival_id": own_festival["id"], "performed_by": str(other_owner.id)},
        headers=auth(dad),
    )

    assert foreign.status_code == 404
    assert outsider.status_code == 422


def test_checklist_marks_completed_traditions_for_that_festival(
    client: TestClient, make_user
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    diya = create_tradition(client, dad, household_id)
    create_tradition(client, dad, household_id, name="Rangoli", category="DECORATION")
    create_tradition(client, dad, household_id, name="Tree", festival_type="CHRISTMAS")
    retired = create_tradition(client, dad, household_id, name="Old", category="FOOD")
    client.patch(f"{API}/traditions/{retired['id']}", json={"active": False}, headers=auth(dad))
    festival = create_festival(client, dad, household_id)
    client.post(
        f"{API}/traditions/{diya['id']}/occurrences",
        json={"festival_id": festival["id"], "performed_by": str(dad.id)},
        headers=auth(dad),
    )

    items = client.get(f"{API}/festivals/{festival['id']}/checklist", headers=auth(dad)).json()

    assert [(i["tradition"]["name"], i["completed"]) for i in items] == [
        ("First Diya", True),
        ("Rangoli", False),
    ]
    assert items[0]["performed_by"]["name"] == "dad"
    assert items[1]["performed_by"] is None


def test_read_queries_do_not_grow_with_rows(client: TestClient, engine: Engine, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    festival = create_festival(client, dad, household_id)
    traditions = [create_tradition(client, dad, household_id, name=f"T{i}") for i in range(6)]
    statements: list[str] = []

    @event.listens_for(engine, "before_cursor_execute")
    def count(_conn, _cursor, statement, *_):
        if not statement.startswith("SET LOCAL"):  # per-transaction setup, not a data query
            statements.append(statement)

    client.get(f"{API}/festivals/{festival['id']}/checklist", headers=auth(dad))
    checklist_queries = len(statements)
    for t in traditions[:3]:
        client.post(
            f"{API}/traditions/{t['id']}/occurrences",
            json={"festival_id": festival["id"]},
            headers=auth(dad),
        )

    statements.clear()
    client.get(f"{API}/festivals/{festival['id']}/checklist", headers=auth(dad))
    assert len(statements) == checklist_queries

    for year in range(2020, 2025):
        past = create_festival(
            client,
            dad,
            household_id,
            name=f"D{year}",
            start_date=f"{year}-11-01",
            end_date=f"{year}-11-02",
        )
        client.post(
            f"{API}/traditions/{traditions[0]['id']}/occurrences",
            json={"festival_id": past["id"], "performed_by": str(dad.id)},
            headers=auth(dad),
        )

    statements.clear()
    detail = client.get(f"{API}/traditions/{traditions[0]['id']}", headers=auth(dad)).json()
    assert len(detail["occurrences"]) == 6
    assert len(statements) <= 6


def test_occurrence_must_match_the_tradition_festival_type(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    diya = create_tradition(client, dad, household_id)
    christmas = create_festival(client, dad, household_id, type="CHRISTMAS", name="Christmas 2026")

    response = client.post(
        f"{API}/traditions/{diya['id']}/occurrences",
        json={"festival_id": christmas["id"]},
        headers=auth(dad),
    )

    assert response.status_code == 422


def test_occurrence_cannot_be_completed_in_the_future(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    diya = create_tradition(client, dad, household_id)
    festival = create_festival(client, dad, household_id)

    response = client.post(
        f"{API}/traditions/{diya['id']}/occurrences",
        json={"festival_id": festival["id"], "completed_at": "2099-01-01T00:00:00Z"},
        headers=auth(dad),
    )

    assert response.status_code == 422


def test_patch_can_clear_optional_fields_but_not_required_ones(
    client: TestClient, make_user
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    tradition = create_tradition(client, dad, household_id, description="old story")
    url = f"{API}/traditions/{tradition['id']}"

    cleared = client.patch(url, json={"description": None}, headers=auth(dad))
    untouched = client.patch(url, json={"active": False}, headers=auth(dad))
    bad = client.patch(url, json={"name": None}, headers=auth(dad))

    assert cleared.json()["description"] is None
    assert untouched.json()["name"] == "First Diya"
    assert bad.status_code == 422


def test_blank_tradition_name_is_rejected(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)

    response = client.post(
        f"{API}/households/{household_id}/traditions",
        json={**FIRST_DIYA, "name": "   "},
        headers=auth(dad),
    )

    assert response.status_code == 422
