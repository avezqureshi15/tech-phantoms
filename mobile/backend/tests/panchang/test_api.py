from fastapi.testclient import TestClient

from tests.support import API, auth


def test_day_panchang_for_a_city(client: TestClient, make_user) -> None:
    user = make_user("dad@example.com")

    response = client.get(
        f"{API}/panchang/day", params={"on": "2026-11-08", "city": "delhi"}, headers=auth(user)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["tithis"][-1]["name"] == "Amavasya"
    assert body["month_amanta"] == "Ashwin"
    assert body["place"]["name"] == "New Delhi"


def test_purnimanta_names_the_dark_fortnight_for_the_next_month(
    client: TestClient, make_user
) -> None:
    user = make_user("dad@example.com")

    body = client.get(
        f"{API}/panchang/day",
        params={"on": "2026-11-08", "city": "delhi", "scheme": "purnimanta"},
        headers=auth(user),
    ).json()

    assert (body["month_amanta"], body["month_purnimanta"]) == ("Ashwin", "Kartika")


def test_observances_can_be_filtered_by_faith(client: TestClient, make_user) -> None:
    user = make_user("dad@example.com")

    sikh = client.get(
        f"{API}/panchang/observances",
        params={"year": 2026, "city": "delhi", "faith": "sikh"},
        headers=auth(user),
    ).json()
    everything = client.get(
        f"{API}/panchang/observances", params={"year": 2026, "city": "delhi"}, headers=auth(user)
    ).json()

    assert {o["faith"] for o in sikh["observances"]} == {"sikh"}
    assert {"hindu", "sikh", "jain", "buddhist"} <= {o["faith"] for o in everything["observances"]}


def test_coordinates_work_for_places_outside_the_city_list(client: TestClient, make_user) -> None:
    user = make_user("dad@example.com")

    response = client.get(
        f"{API}/panchang/day",
        params={
            "on": "2026-11-08",
            "latitude": 40.7128,
            "longitude": -74.006,
            "timezone": "America/New_York",
        },
        headers=auth(user),
    )

    assert response.status_code == 200
    assert response.json()["sunrise"].endswith("-05:00")


def test_bad_input_is_rejected(client: TestClient, make_user) -> None:
    user = make_user("dad@example.com")
    day = f"{API}/panchang/day"

    cases = [
        {"on": "2026-11-08", "city": "atlantis"},
        {"on": "2026-11-08", "latitude": 28.6},  # longitude missing
        {"on": "2026-11-08", "latitude": 28.6, "longitude": 77.2, "timezone": "Mars/Base"},
        {"on": "2026-11-08", "latitude": 128.6, "longitude": 77.2},
        {"on": "1800-01-01", "city": "delhi"},
        {"on": "not-a-date", "city": "delhi"},
    ]

    assert [client.get(day, params=c, headers=auth(user)).status_code for c in cases] == [422] * 6


def test_the_city_list_and_authentication(client: TestClient, make_user) -> None:
    user = make_user("dad@example.com")

    cities = client.get(f"{API}/panchang/cities", headers=auth(user)).json()

    assert "delhi" in {c["key"] for c in cities}
    assert client.get(f"{API}/panchang/cities").status_code == 401
