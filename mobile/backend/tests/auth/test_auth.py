import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient

from tests.support import API, auth


def sign_in(client: TestClient, sub: str = "g1", email: str = "asha@example.com"):
    return client.post(f"{API}/auth/google", json={"id_token": f"google:{sub}:{email}"})


def test_google_sign_in_creates_user_and_returns_tokens(client: TestClient) -> None:
    response = sign_in(client)

    assert response.status_code == 200
    body = response.json()
    assert body["user"]["email"] == "asha@example.com"
    assert body["token_type"] == "bearer"
    me = client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {body['access_token']}"})
    assert me.json()["id"] == body["user"]["id"]


def test_second_sign_in_reuses_same_user(client: TestClient) -> None:
    first = sign_in(client).json()["user"]["id"]
    second = sign_in(client).json()["user"]["id"]

    assert first == second


def test_invalid_google_credential_is_rejected(client: TestClient) -> None:
    response = client.post(f"{API}/auth/google", json={"id_token": "forged"})

    assert response.status_code == 401


def test_me_requires_a_valid_token(client: TestClient, make_user) -> None:
    assert client.get(f"{API}/users/me").status_code == 401
    bad = {"Authorization": "Bearer not-a-jwt"}
    assert client.get(f"{API}/users/me", headers=bad).status_code == 401

    user = make_user("a@example.com")
    assert client.get(f"{API}/users/me", headers=auth(user)).status_code == 200


def test_expired_and_foreign_signed_tokens_are_rejected(client: TestClient, make_user) -> None:
    user = make_user("a@example.com")
    now = datetime.now(UTC)
    claims = {
        "sub": str(user.id),
        "sid": str(user.test_session_id),
        "iss": "festiveos",
        "iat": now - timedelta(hours=2),
        "exp": now - timedelta(hours=1),
    }
    expired = jwt.encode(claims, "t" * 48, algorithm="HS256")
    forged = jwt.encode({**claims, "exp": now + timedelta(hours=1)}, "x" * 48, algorithm="HS256")

    for token in (expired, forged):
        response = client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401


def test_token_for_unknown_user_is_rejected(client: TestClient) -> None:
    from festiveos.core.security import create_access_token

    token = create_access_token(uuid.uuid4(), uuid.uuid4())

    response = client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 401


def test_refresh_rotates_token_and_old_one_stops_working(client: TestClient) -> None:
    old = sign_in(client).json()["refresh_token"]

    rotated = client.post(f"{API}/auth/refresh", json={"refresh_token": old})
    replay = client.post(f"{API}/auth/refresh", json={"refresh_token": old})

    assert rotated.status_code == 200
    assert rotated.json()["refresh_token"] != old
    assert replay.status_code == 401


def test_replaying_a_rotated_token_revokes_the_whole_family(client: TestClient) -> None:
    old = sign_in(client).json()["refresh_token"]
    newest = client.post(f"{API}/auth/refresh", json={"refresh_token": old}).json()["refresh_token"]

    client.post(f"{API}/auth/refresh", json={"refresh_token": old})
    after_theft = client.post(f"{API}/auth/refresh", json={"refresh_token": newest})

    assert after_theft.status_code == 401


def test_logout_revokes_refresh_token(client: TestClient) -> None:
    token = sign_in(client).json()["refresh_token"]

    assert client.post(f"{API}/auth/logout", json={"refresh_token": token}).status_code == 204
    assert client.post(f"{API}/auth/refresh", json={"refresh_token": token}).status_code == 401


def test_unknown_refresh_token_is_rejected(client: TestClient) -> None:
    response = client.post(f"{API}/auth/refresh", json={"refresh_token": "nope"})

    assert response.status_code == 401


def test_second_google_account_with_same_email_cannot_take_over(client: TestClient) -> None:
    original = sign_in(client, sub="sub-A", email="x@example.com").json()["user"]["id"]

    intruder = sign_in(client, sub="sub-B", email="x@example.com")
    owner_again = sign_in(client, sub="sub-A", email="x@example.com")

    assert intruder.status_code == 409
    assert owner_again.json()["user"]["id"] == original


def test_first_google_sign_in_links_a_preexisting_account(client: TestClient, make_user) -> None:
    existing = make_user("mom@example.com")

    response = sign_in(client, sub="sub-M", email="mom@example.com")

    assert response.json()["user"]["id"] == str(existing.id)


def bearer(body: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {body['access_token']}"}


def test_logout_revokes_the_access_token_immediately(client: TestClient) -> None:
    body = sign_in(client).json()
    assert client.get(f"{API}/users/me", headers=bearer(body)).status_code == 200

    client.post(f"{API}/auth/logout", json={"refresh_token": body["refresh_token"]})

    # The JWT is still within its lifetime, but its session is gone.
    assert client.get(f"{API}/users/me", headers=bearer(body)).status_code == 401


def test_logout_ends_only_its_own_session(client: TestClient) -> None:
    phone = sign_in(client).json()
    tablet = sign_in(client).json()

    client.post(f"{API}/auth/logout", json={"refresh_token": phone["refresh_token"]})

    assert client.get(f"{API}/users/me", headers=bearer(phone)).status_code == 401
    assert client.get(f"{API}/users/me", headers=bearer(tablet)).status_code == 200
    assert (
        client.post(
            f"{API}/auth/refresh", json={"refresh_token": tablet["refresh_token"]}
        ).status_code
        == 200
    )


def test_logging_out_twice_or_with_an_unknown_token_is_harmless(client: TestClient) -> None:
    body = sign_in(client).json()
    payload = {"refresh_token": body["refresh_token"]}

    assert client.post(f"{API}/auth/logout", json=payload).status_code == 204
    assert client.post(f"{API}/auth/logout", json=payload).status_code == 204
    assert (
        client.post(f"{API}/auth/logout", json={"refresh_token": "never-issued"}).status_code == 204
    )


def test_refreshing_keeps_the_session_so_earlier_access_tokens_stay_valid(
    client: TestClient,
) -> None:
    first = sign_in(client).json()

    second = client.post(
        f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]}
    ).json()

    assert client.get(f"{API}/users/me", headers=bearer(first)).status_code == 200
    assert client.get(f"{API}/users/me", headers=bearer(second)).status_code == 200


def test_a_replayed_refresh_token_ends_the_session_and_its_access_tokens(
    client: TestClient,
) -> None:
    first = sign_in(client).json()
    second = client.post(
        f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]}
    ).json()

    replay = client.post(f"{API}/auth/refresh", json={"refresh_token": first["refresh_token"]})

    assert replay.status_code == 401
    assert client.get(f"{API}/users/me", headers=bearer(second)).status_code == 401
    assert (
        client.post(
            f"{API}/auth/refresh", json={"refresh_token": second["refresh_token"]}
        ).status_code
        == 401
    )


def test_a_replay_in_one_session_does_not_end_the_users_other_sessions(client: TestClient) -> None:
    phone = sign_in(client).json()
    tablet = sign_in(client).json()
    client.post(f"{API}/auth/refresh", json={"refresh_token": phone["refresh_token"]})

    client.post(f"{API}/auth/refresh", json={"refresh_token": phone["refresh_token"]})  # replay

    assert client.get(f"{API}/users/me", headers=bearer(tablet)).status_code == 200


def test_access_tokens_must_name_a_live_session_of_the_same_user(
    client: TestClient, make_user
) -> None:
    from festiveos.core.security import create_access_token

    alice, bob = make_user("alice@example.com"), make_user("bob@example.com")
    cases = {
        "unknown session": create_access_token(alice.id, uuid.uuid4()),
        "someone else's session": create_access_token(alice.id, bob.test_session_id),
    }

    for name, token in cases.items():
        response = client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 401, name


def test_a_token_without_a_session_claim_is_rejected(client: TestClient, make_user) -> None:
    user = make_user("a@example.com")
    now = datetime.now(UTC)
    legacy = jwt.encode(
        {"sub": str(user.id), "iss": "festiveos", "iat": now, "exp": now + timedelta(minutes=5)},
        "t" * 48,
        algorithm="HS256",
    )

    assert (
        client.get(f"{API}/users/me", headers={"Authorization": f"Bearer {legacy}"}).status_code
        == 401
    )
