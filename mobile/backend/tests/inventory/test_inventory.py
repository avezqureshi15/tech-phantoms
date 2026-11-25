from fastapi.testclient import TestClient

from tests.support import API, auth, setup_household

CHAIRS = {"name": "Plastic chairs", "category": "seating", "quantity": 6}


def add(client: TestClient, user, household_id: str, **overrides) -> dict:
    response = client.post(
        f"{API}/households/{household_id}/inventory",
        json={**CHAIRS, **overrides},
        headers=auth(user),
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_any_member_can_add_update_and_delete_items(client: TestClient, make_user) -> None:
    _, mom, household_id = setup_household(client, make_user)

    item = add(client, mom, household_id)
    updated = client.patch(f"{API}/inventory/{item['id']}", json={"quantity": 8}, headers=auth(mom))
    deleted = client.delete(f"{API}/inventory/{item['id']}", headers=auth(mom))
    listing = client.get(f"{API}/households/{household_id}/inventory", headers=auth(mom))

    assert updated.json()["quantity"] == 8
    assert deleted.status_code == 204
    assert listing.json() == []


def test_outsiders_get_404_everywhere(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    item = add(client, dad, household_id)
    stranger = make_user("stranger@example.com")

    responses = [
        client.get(f"{API}/households/{household_id}/inventory", headers=auth(stranger)),
        client.post(
            f"{API}/households/{household_id}/inventory", json=CHAIRS, headers=auth(stranger)
        ),
        client.patch(f"{API}/inventory/{item['id']}", json={"quantity": 1}, headers=auth(stranger)),
        client.delete(f"{API}/inventory/{item['id']}", headers=auth(stranger)),
    ]

    assert [r.status_code for r in responses] == [404, 404, 404, 404]


def test_input_is_validated(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    url = f"{API}/households/{household_id}/inventory"

    negative = client.post(url, json={**CHAIRS, "quantity": -1}, headers=auth(dad))
    unknown = client.post(url, json={**CHAIRS, "category": "spaceship"}, headers=auth(dad))
    blank = client.post(url, json={**CHAIRS, "name": "   "}, headers=auth(dad))

    assert [negative.status_code, unknown.status_code, blank.status_code] == [422, 422, 422]


def test_list_filters_by_category(client: TestClient, make_user) -> None:
    dad, _, household_id = setup_household(client, make_user)
    add(client, dad, household_id)
    add(client, dad, household_id, name="Dari", category="floor_seating", quantity=2)

    response = client.get(
        f"{API}/households/{household_id}/inventory?category=floor_seating", headers=auth(dad)
    )

    assert [i["name"] for i in response.json()] == ["Dari"]
