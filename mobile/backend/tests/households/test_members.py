import threading

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from festiveos.households.access import HouseholdAccess
from festiveos.households.models import HouseholdMember
from tests.support import API, TEST_DATABASE_URL, auth, household_with, member_url, roles


def test_admin_changes_role_and_relationship(client: TestClient, make_user) -> None:
    dad, mom, _, hid = household_with(client, make_user)

    response = client.patch(
        member_url(hid, mom),
        json={"role": "admin", "relationship": "MOTHER", "notification_preference": "important"},
        headers=auth(dad),
    )

    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    assert response.json()["relationship"] == "MOTHER"
    assert response.json()["notification_preference"] == "important"
    cleared = client.patch(member_url(hid, mom), json={"relationship": None}, headers=auth(dad))
    assert cleared.json()["relationship"] is None


def test_member_can_edit_own_preferences_but_not_role(client: TestClient, make_user) -> None:
    _, mom, _, hid = household_with(client, make_user)

    own = client.patch(member_url(hid, mom), json={"relationship": "MOTHER"}, headers=auth(mom))
    escalate = client.patch(member_url(hid, mom), json={"role": "admin"}, headers=auth(mom))

    assert own.status_code == 200
    assert escalate.status_code == 403


def test_member_cannot_edit_someone_else(client: TestClient, make_user) -> None:
    _, mom, son, hid = household_with(client, make_user)

    response = client.patch(member_url(hid, son), json={"relationship": "SON"}, headers=auth(mom))

    assert response.status_code == 403


def test_patch_validation(client: TestClient, make_user) -> None:
    dad, mom, _, hid = household_with(client, make_user)

    assert client.patch(member_url(hid, mom), json={}, headers=auth(dad)).status_code == 422
    assert (
        client.patch(member_url(hid, mom), json={"role": None}, headers=auth(dad)).status_code
        == 422
    )
    assert (
        client.patch(member_url(hid, mom), json={"role": "owner"}, headers=auth(dad)).status_code
        == 422
    )


def test_unknown_target_and_outsiders_get_404(client: TestClient, make_user) -> None:
    dad, _, _, hid = household_with(client, make_user)
    stranger = make_user("x@example.com")

    not_a_member = client.patch(
        member_url(hid, stranger), json={"role": "admin"}, headers=auth(dad)
    )
    outsider = client.delete(member_url(hid, dad), headers=auth(stranger))

    assert not_a_member.status_code == 404
    assert outsider.status_code == 404


def test_admin_removes_member_who_then_loses_access(client: TestClient, make_user) -> None:
    dad, mom, _, hid = household_with(client, make_user)

    removed = client.delete(member_url(hid, mom), headers=auth(dad))
    after = client.get(f"{API}/households/{hid}", headers=auth(mom))

    assert removed.status_code == 204
    assert after.status_code == 404
    assert "mom" not in roles(client, dad, hid)
    assert client.get(f"{API}/households", headers=auth(mom)).json() == []


def test_member_can_leave_but_not_remove_others(client: TestClient, make_user) -> None:
    dad, mom, son, hid = household_with(client, make_user)

    forbidden = client.delete(member_url(hid, son), headers=auth(mom))
    left = client.delete(member_url(hid, mom), headers=auth(mom))

    assert forbidden.status_code == 403
    assert left.status_code == 204
    assert set(roles(client, dad, hid)) == {"dad", "son"}


def test_the_last_admin_cannot_leave_be_removed_or_demoted(client: TestClient, make_user) -> None:
    dad, _, _, hid = household_with(client, make_user)

    leave = client.delete(member_url(hid, dad), headers=auth(dad))
    demote = client.patch(member_url(hid, dad), json={"role": "member"}, headers=auth(dad))

    assert leave.status_code == demote.status_code == 409
    assert roles(client, dad, hid)["dad"] == "admin"


def test_an_admin_can_step_down_once_another_admin_exists(client: TestClient, make_user) -> None:
    dad, mom, _, hid = household_with(client, make_user)
    client.patch(member_url(hid, mom), json={"role": "admin"}, headers=auth(dad))

    demote = client.patch(member_url(hid, dad), json={"role": "member"}, headers=auth(dad))
    last = client.patch(member_url(hid, mom), json={"role": "member"}, headers=auth(mom))

    assert demote.status_code == 200
    assert last.status_code == 409
    assert roles(client, mom, hid)["mom"] == "admin"


@pytest.mark.skipif(not TEST_DATABASE_URL, reason="needs real Postgres: set TEST_DATABASE_URL")
def test_two_admins_cannot_demote_each_other_at_the_same_time(
    client: TestClient,
    make_user,
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    dad, mom, _, hid = household_with(client, make_user)
    client.patch(member_url(hid, mom), json={"role": "admin"}, headers=auth(dad))

    barrier = threading.Barrier(2, timeout=10)
    original = HouseholdAccess.member

    def after_permission_check(self, household_id, user_id):
        member = original(self, household_id, user_id)
        barrier.wait()  # both admins have now passed their permission check
        return member

    monkeypatch.setattr(HouseholdAccess, "member", after_permission_check)

    statuses: list[int] = []

    def demote(actor, target):
        response = TestClient(client.app).patch(
            member_url(hid, target), json={"role": "member"}, headers=auth(actor)
        )
        statuses.append(response.status_code)

    threads = [
        threading.Thread(target=demote, args=(dad, mom)),
        threading.Thread(target=demote, args=(mom, dad)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)

    with session_factory() as session:
        admins = session.scalar(
            select(func.count()).select_from(HouseholdMember).where(HouseholdMember.role == "admin")
        )
    winner, loser = sorted(statuses)
    assert winner == 200
    assert loser in (403, 409)  # stale-admin or last-admin, both are correct rejections
    assert admins == 1


def test_sole_member_can_delete_the_household_and_all_its_data(
    client: TestClient, make_user, session_factory
) -> None:
    from festiveos.festivals.models import Festival, FestivalEvent
    from festiveos.households.models import Household
    from festiveos.traditions.models import Tradition, TraditionOccurrence
    from festiveos.users.models import User

    dad = make_user("dad@example.com")
    hid = client.post(f"{API}/households", json={"name": "Raju"}, headers=auth(dad)).json()["id"]
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
        f"{API}/festivals/{festival['id']}/events",
        json={"name": "Puja", "event_date": "2026-11-09"},
        headers=auth(dad),
    )
    tradition = client.post(
        f"{API}/households/{hid}/traditions",
        json={"festival_type": "DIWALI", "name": "First Diya", "category": "RITUAL"},
        headers=auth(dad),
    ).json()
    client.post(
        f"{API}/traditions/{tradition['id']}/occurrences",
        json={"festival_id": festival["id"]},
        headers=auth(dad),
    )

    response = client.delete(f"{API}/households/{hid}", headers=auth(dad))

    assert response.status_code == 204
    assert client.get(f"{API}/households/{hid}", headers=auth(dad)).status_code == 404
    assert client.get(f"{API}/households", headers=auth(dad)).json() == []
    with session_factory() as session:
        for model in (
            Household,
            HouseholdMember,
            Festival,
            FestivalEvent,
            Tradition,
            TraditionOccurrence,
        ):
            assert session.scalar(select(func.count()).select_from(model)) == 0, model.__name__
        assert session.scalar(select(func.count()).select_from(User)) == 1  # accounts are untouched


def test_household_with_other_members_cannot_be_deleted(client: TestClient, make_user) -> None:
    dad, mom, _, hid = household_with(client, make_user)

    by_admin = client.delete(f"{API}/households/{hid}", headers=auth(dad))
    by_member = client.delete(f"{API}/households/{hid}", headers=auth(mom))

    assert by_admin.status_code == 409
    assert by_member.status_code == 403
    assert client.get(f"{API}/households/{hid}", headers=auth(dad)).status_code == 200


def test_household_can_be_deleted_once_everyone_else_has_left(
    client: TestClient, make_user
) -> None:
    dad, mom, son, hid = household_with(client, make_user)
    for user in (mom, son):
        client.delete(member_url(hid, user), headers=auth(user))

    assert client.delete(f"{API}/households/{hid}", headers=auth(dad)).status_code == 204


def test_outsiders_cannot_delete_a_household(client: TestClient, make_user) -> None:
    _, _, _, hid = household_with(client, make_user)

    response = client.delete(f"{API}/households/{hid}", headers=auth(make_user("x@example.com")))

    assert response.status_code == 404
