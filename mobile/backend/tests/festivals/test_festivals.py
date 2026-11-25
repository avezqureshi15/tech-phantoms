import uuid

from fastapi.testclient import TestClient

from tests.support import API, DIWALI, auth, create_festival, setup_household


def test_admin_creates_festival_with_computed_year(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)

    festival = create_festival(client, dad, household_id)

    assert festival["year"] == 2026
    assert festival["status"] == "planning"
    assert festival["readiness_score"] == 0


def test_non_admin_cannot_create_festival(client: TestClient, make_user) -> None:
    _, mom, household_id = setup_household(client, make_user)

    response = client.post(
        f"{API}/households/{household_id}/festivals", json=DIWALI, headers=auth(mom)
    )

    assert response.status_code == 403


def test_create_festival_validates_input(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    url = f"{API}/households/{household_id}/festivals"

    backwards = client.post(url, json={**DIWALI, "end_date": "2026-11-01"}, headers=auth(dad))
    unknown = client.post(url, json={**DIWALI, "type": "NOPE"}, headers=auth(dad))

    assert backwards.status_code == 422
    assert unknown.status_code == 422


def test_list_filters_by_status_and_paginates(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    first = create_festival(client, dad, household_id)
    create_festival(
        client,
        dad,
        household_id,
        name="Diwali 2027",
        start_date="2027-10-29",
        end_date="2027-11-02",
    )
    client.patch(f"{API}/festivals/{first['id']}", json={"status": "completed"}, headers=auth(dad))
    url = f"{API}/households/{household_id}/festivals"

    completed = client.get(url, params={"status": "completed"}, headers=auth(dad)).json()
    page = client.get(url, params={"limit": 1, "offset": 1}, headers=auth(dad)).json()

    assert [f["id"] for f in completed] == [first["id"]]
    assert [f["name"] for f in page] == ["Diwali 2026"]


def test_non_member_gets_404_everywhere(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    festival = create_festival(client, dad, household_id)
    stranger = auth(make_user("x@example.com"))

    assert (
        client.get(f"{API}/households/{household_id}/festivals", headers=stranger).status_code
        == 404
    )
    assert client.get(f"{API}/festivals/{festival['id']}", headers=stranger).status_code == 404
    assert (
        client.patch(
            f"{API}/festivals/{festival['id']}", json={"name": "x"}, headers=stranger
        ).status_code
        == 404
    )


def test_update_rejects_dates_that_become_inverted(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    festival = create_festival(client, dad, household_id)

    response = client.patch(
        f"{API}/festivals/{festival['id']}", json={"end_date": "2026-11-01"}, headers=auth(dad)
    )

    assert response.status_code == 422
    detail = client.get(f"{API}/festivals/{festival['id']}", headers=auth(dad)).json()
    assert detail["end_date"] == "2026-11-12"


def test_events_are_sorted_and_must_fall_within_festival(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    festival = create_festival(client, dad, household_id)
    url = f"{API}/festivals/{festival['id']}/events"

    late = client.post(
        url,
        json={"name": "Lakshmi Puja", "event_date": "2026-11-10", "start_time": "19:30:00"},
        headers=auth(dad),
    )
    early = client.post(
        url, json={"name": "Dhanteras", "event_date": "2026-11-08"}, headers=auth(dad)
    )
    outside = client.post(url, json={"name": "Nope", "event_date": "2026-12-01"}, headers=auth(dad))
    bad_times = client.post(
        url,
        json={
            "name": "X",
            "event_date": "2026-11-09",
            "start_time": "10:00:00",
            "end_time": "09:00:00",
        },
        headers=auth(dad),
    )

    assert late.status_code == early.status_code == 201
    assert outside.status_code == 422
    assert bad_times.status_code == 422
    detail = client.get(f"{API}/festivals/{festival['id']}", headers=auth(dad)).json()
    assert [e["name"] for e in detail["events"]] == ["Dhanteras", "Lakshmi Puja"]


def test_unknown_festival_is_404(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")

    response = client.get(f"{API}/festivals/{uuid.uuid4()}", headers=auth(dad))

    assert response.status_code == 404


def test_update_rejects_explicit_null_for_required_fields(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    festival = create_festival(client, dad, household_id)

    response = client.patch(
        f"{API}/festivals/{festival['id']}", json={"status": None}, headers=auth(dad)
    )

    assert response.status_code == 422


def test_blank_names_unknown_fields_and_absurd_spans_are_rejected(
    client: TestClient, make_user
) -> None:
    dad, _, household_id = setup_household(client, make_user)
    url = f"{API}/households/{household_id}/festivals"

    blank = client.post(url, json={**DIWALI, "name": "   "}, headers=auth(dad))
    typo = client.post(url, json={**DIWALI, "nmae": "oops"}, headers=auth(dad))
    huge = client.post(
        url,
        json={**DIWALI, "start_date": "2026-01-01", "end_date": "2027-12-31"},
        headers=auth(dad),
    )
    trimmed = client.post(url, json={**DIWALI, "name": "  Diwali  "}, headers=auth(dad))

    assert blank.status_code == typo.status_code == huge.status_code == 422
    assert trimmed.json()["name"] == "Diwali"


def test_event_end_time_requires_a_start_time(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    festival = create_festival(client, dad, household_id)

    response = client.post(
        f"{API}/festivals/{festival['id']}/events",
        json={"name": "Puja", "event_date": "2026-11-09", "end_time": "10:00:00"},
        headers=auth(dad),
    )

    assert response.status_code == 422
