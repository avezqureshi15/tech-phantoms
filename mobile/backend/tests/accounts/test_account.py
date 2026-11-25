from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from festiveos.auth.models import AuthSession, RefreshToken
from festiveos.festivals.models import Festival
from festiveos.households.models import Household, HouseholdMember
from festiveos.traditions.models import Tradition
from festiveos.users.models import User
from tests.support import API, auth, household_with, member_url, roles

ME = f"{API}/users/me"


def delete_me(client: TestClient, user) -> int:
    return client.delete(ME, headers=auth(user)).status_code


def count(session_factory: sessionmaker[Session], model, *conditions) -> int:
    with session_factory() as session:
        return session.scalar(select(func.count()).select_from(model).where(*conditions))


def test_deleting_an_account_requires_authentication(client: TestClient) -> None:
    assert client.delete(ME).status_code == 401


def test_a_member_leaves_their_households_and_the_account_is_gone(
    client: TestClient, make_user, session_factory
) -> None:
    dad, mom, _, hid = household_with(client, make_user)
    tradition = client.post(
        f"{API}/households/{hid}/traditions",
        json={"festival_type": "DIWALI", "name": "Mysore Pak", "category": "FOOD"},
        headers=auth(mom),
    ).json()
    festival = client.post(
        f"{API}/households/{hid}/festivals",
        json={
            "type": "DIWALI",
            "name": "Diwali",
            "start_date": "2026-11-08",
            "end_date": "2026-11-12",
        },
        headers=auth(dad),
    ).json()
    client.post(
        f"{API}/traditions/{tradition['id']}/occurrences",
        json={"festival_id": festival["id"], "performed_by": str(mom.id)},
        headers=auth(mom),
    )

    assert delete_me(client, mom) == 204

    assert (
        client.get(ME, headers=auth(mom)).status_code == 401
    )  # the account and its tokens are gone
    assert set(roles(client, dad, hid)) == {"dad", "son"}
    kept = client.get(f"{API}/traditions/{tradition['id']}", headers=auth(dad)).json()
    assert kept["created_by"] is None  # the family keeps what she recorded...
    assert kept["occurrences"][0]["performer"] is None  # ...without a link back to her
    assert count(session_factory, User, User.id == mom.id) == 0


def test_a_sole_member_takes_the_household_and_its_data_with_them(
    client: TestClient, make_user, session_factory
) -> None:
    dad = make_user("dad@example.com")
    hid = client.post(f"{API}/households", json={"name": "Solo"}, headers=auth(dad)).json()["id"]
    client.post(
        f"{API}/households/{hid}/festivals",
        json={
            "type": "DIWALI",
            "name": "Diwali",
            "start_date": "2026-11-08",
            "end_date": "2026-11-12",
        },
        headers=auth(dad),
    )

    assert delete_me(client, dad) == 204

    assert count(session_factory, Household) == 0
    assert count(session_factory, Festival) == 0
    assert count(session_factory, HouseholdMember) == 0


def test_the_only_admin_of_a_household_with_others_must_hand_over_first(
    client: TestClient, make_user, session_factory
) -> None:
    dad, mom, _, hid = household_with(client, make_user)

    blocked = client.delete(ME, headers=auth(dad))

    assert blocked.status_code == 409
    assert "only admin" in blocked.json()["detail"]
    assert count(session_factory, User, User.id == dad.id) == 1
    assert roles(client, dad, hid)["dad"] == "admin"

    client.patch(member_url(hid, mom), json={"role": "admin"}, headers=auth(dad))
    assert delete_me(client, dad) == 204


def test_a_blocked_deletion_changes_nothing_at_all(
    client: TestClient, make_user, session_factory
) -> None:
    dad, _, _, family = household_with(client, make_user)  # dad: sole admin of a family of 3
    solo = client.post(f"{API}/households", json={"name": "Solo"}, headers=auth(dad)).json()["id"]

    assert client.delete(ME, headers=auth(dad)).status_code == 409

    # The solo household would have been deleted first, so it must have been rolled back.
    assert client.get(f"{API}/households/{solo}", headers=auth(dad)).status_code == 200
    assert client.get(f"{API}/households/{family}", headers=auth(dad)).status_code == 200


def test_deleting_removes_every_session_and_refresh_token(
    client: TestClient, session_factory
) -> None:
    body = client.post(f"{API}/auth/google", json={"id_token": "google:g1:a@example.com"}).json()
    headers = {"Authorization": f"Bearer {body['access_token']}"}

    assert client.delete(ME, headers=headers).status_code == 204

    assert count(session_factory, AuthSession) == 0
    assert count(session_factory, RefreshToken) == 0
    assert (
        client.post(
            f"{API}/auth/refresh", json={"refresh_token": body["refresh_token"]}
        ).status_code
        == 401
    )


def test_the_same_google_account_can_start_fresh_afterwards(client: TestClient) -> None:
    first = client.post(f"{API}/auth/google", json={"id_token": "google:g1:a@example.com"}).json()
    client.delete(ME, headers={"Authorization": f"Bearer {first['access_token']}"})

    again = client.post(f"{API}/auth/google", json={"id_token": "google:g1:a@example.com"}).json()

    assert again["user"]["id"] != first["user"]["id"]


def test_traditions_created_by_a_deleted_user_can_still_be_edited_by_an_admin(
    client: TestClient, make_user, session_factory
) -> None:
    dad, mom, _, hid = household_with(client, make_user)
    tradition = client.post(
        f"{API}/households/{hid}/traditions",
        json={"festival_type": "DIWALI", "name": "Rangoli", "category": "DECORATION"},
        headers=auth(mom),
    ).json()
    delete_me(client, mom)

    response = client.patch(
        f"{API}/traditions/{tradition['id']}", json={"name": "Rangoli at dawn"}, headers=auth(dad)
    )

    assert response.status_code == 200
    assert count(session_factory, Tradition, Tradition.created_by.is_(None)) == 1


def test_a_new_user_has_not_answered_the_faith_question(client, make_user) -> None:
    from tests.support import API, auth

    user = make_user("new@example.com")

    me = client.get(f"{API}/users/me", headers=auth(user)).json()

    assert (me["faiths"], me["faith_chosen"], me["home_city"]) == ([], False, None)


def test_choosing_faiths_is_recorded_even_when_the_answer_is_none(client, make_user) -> None:
    from tests.support import API, auth

    user = make_user("new@example.com")
    url = f"{API}/users/me"

    skipped = client.patch(url, json={"faiths": []}, headers=auth(user)).json()
    chosen = client.patch(
        url,
        json={"faiths": ["muslim", "hindu", "muslim"], "home_city": "mumbai"},
        headers=auth(user),
    ).json()

    assert (skipped["faiths"], skipped["faith_chosen"]) == ([], True)  # answered: prefer not to say
    assert (chosen["faiths"], chosen["home_city"]) == (["muslim", "hindu"], "mumbai")


def test_profile_updates_reject_unknown_values_and_other_fields(client, make_user) -> None:
    from tests.support import API, auth

    user = make_user("new@example.com")
    url = f"{API}/users/me"

    bad = [
        {"faiths": ["pastafarian"]},
        {"home_city": "Not A City"},
        {"email": "x@y.z"},
        {"name": "x"},
    ]

    assert [client.patch(url, json=b, headers=auth(user)).status_code for b in bad] == [422] * 4
    assert client.patch(url, json={"faiths": ["sikh"]}).status_code == 401
