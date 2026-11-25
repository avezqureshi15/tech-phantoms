"""Shared test helpers: plain constants and functions. Fixtures live in conftest.py."""

import os

from fastapi.testclient import TestClient

from festiveos.core.errors import UnauthorizedError
from festiveos.core.security import create_access_token
from festiveos.integrations.google import GoogleIdentity
from festiveos.users.models import User

# Set TEST_DATABASE_URL to run the suite against real Postgres with the real migrations;
# otherwise tests use in-memory SQLite.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

API = "/api/v1"

DIWALI = {
    "type": "DIWALI",
    "name": "Diwali 2026",
    "start_date": "2026-11-08",
    "end_date": "2026-11-12",
}

FIRST_DIYA = {
    "festival_type": "DIWALI",
    "name": "First Diya",
    "category": "RITUAL",
    "scope": "family",
    "started_year": 1998,
}


def auth(user: User) -> dict[str, str]:
    """Authorization header for a user created by the ``make_user`` fixture."""
    token = create_access_token(user.id, user.test_session_id)  # type: ignore[attr-defined]
    return {"Authorization": f"Bearer {token}"}


def fake_google_verifier(token: str) -> GoogleIdentity:
    # Test tokens look like "google:<sub>:<email>"; anything else is rejected.
    prefix, _, rest = token.partition(":")
    sub, _, email = rest.partition(":")
    if prefix != "google" or not sub or not email:
        raise UnauthorizedError("Invalid Google credential")
    return GoogleIdentity(sub=sub, email=email, name=email.split("@")[0], picture=None)


def create_household(client: TestClient, owner: User, name: str = "Raju Family") -> str:
    response = client.post(f"{API}/households", json={"name": name}, headers=auth(owner))
    assert response.status_code == 201
    return response.json()["id"]


def setup_household(client: TestClient, make_user):
    """Dad (admin) and mom (member). Returns (dad, mom, household_id)."""
    dad, mom = make_user("dad@example.com"), make_user("mom@example.com")
    household_id = create_household(client, dad, "Raju")
    client.post(
        f"{API}/households/{household_id}/members",
        json={"email": "mom@example.com"},
        headers=auth(dad),
    )
    return dad, mom, household_id


def household_with(client: TestClient, make_user):
    """Dad (admin), plus mom and son as regular members. Returns (dad, mom, son, household_id)."""
    dad, mom, son = (make_user(f"{n}@example.com") for n in ("dad", "mom", "son"))
    household_id = create_household(client, dad, "Raju")
    for user in (mom, son):
        client.post(
            f"{API}/households/{household_id}/members",
            json={"email": user.email},
            headers=auth(dad),
        )
    return dad, mom, son, household_id


def member_url(household_id: str, user: User) -> str:
    return f"{API}/households/{household_id}/members/{user.id}"


def roles(client: TestClient, user: User, household_id: str) -> dict[str, str]:
    body = client.get(f"{API}/households/{household_id}", headers=auth(user)).json()
    return {m["user"]["name"]: m["role"] for m in body["members"]}


def create_festival(client: TestClient, user: User, household_id: str, **overrides) -> dict:
    response = client.post(
        f"{API}/households/{household_id}/festivals",
        json={**DIWALI, **overrides},
        headers=auth(user),
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_tradition(client: TestClient, user: User, household_id: str, **overrides) -> dict:
    response = client.post(
        f"{API}/households/{household_id}/traditions",
        json={**FIRST_DIYA, **overrides},
        headers=auth(user),
    )
    assert response.status_code == 201, response.text
    return response.json()
