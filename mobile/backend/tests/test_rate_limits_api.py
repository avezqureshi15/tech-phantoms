"""Rate limits as clients experience them: which endpoints, who is charged, what they see."""

import logging
import uuid

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from festiveos.main import app, create_app
from tests.support import API, auth, create_household, household_with, member_url

JUNK = {"Authorization": "Bearer not-a-jwt"}


def google(client: TestClient, **kwargs):
    """Sign-in with a forged credential: rejected as 401, but it still counts against the limit."""
    return client.post(f"{API}/auth/google", json={"id_token": "forged"}, **kwargs)


def api_routes(application) -> list[APIRoute]:
    """Every real route. Included routers are wrapped, so walk into them."""
    found: list[APIRoute] = []
    for route in application.routes:
        inner = getattr(route, "original_router", None)
        if inner is not None:
            found.extend(api_routes(inner))
        elif isinstance(route, APIRoute):
            found.append(route)
    return found


def has_limit(node) -> bool:
    return hasattr(node.call, "rate_limit") or any(has_limit(d) for d in node.dependencies)


def test_every_route_has_a_rate_limit() -> None:
    """A route added later without a limit would be a free denial-of-service target."""
    routes = api_routes(app)

    # Guard against this test silently checking nothing: it must see every operation the API has.
    published = create_app(enable_docs=True).openapi()["paths"]
    operations = sum(len(methods) for methods in published.values())
    assert sum(len(r.methods - {"HEAD", "OPTIONS"}) for r in routes) == operations
    assert operations >= 27

    unlimited = [r.path for r in routes if not has_limit(r.dependant)]
    assert not unlimited, f"routes without a rate limit: {unlimited}"


def test_sign_in_is_limited_per_address_and_the_rejection_says_when_to_retry(
    client: TestClient,
) -> None:
    statuses = [google(client).status_code for _ in range(10)]  # all rejected as forged...

    assert statuses == [401] * 10
    blocked = google(client)  # ...but each one counted
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) >= 1
    assert blocked.headers["x-ratelimit-limit"] == "10"
    assert blocked.headers["x-ratelimit-remaining"] == "0"
    body = blocked.json()
    assert "try again in" in body["detail"]
    assert body["request_id"] == blocked.headers["x-request-id"]


def test_successful_responses_report_the_remaining_allowance(client: TestClient, make_user) -> None:
    user = make_user("a@example.com")

    first = client.get(f"{API}/users/me", headers=auth(user))
    second = client.get(f"{API}/users/me", headers=auth(user))

    assert first.headers["x-ratelimit-limit"] == "300"
    assert (
        int(first.headers["x-ratelimit-remaining"]) - int(second.headers["x-ratelimit-remaining"])
        == 1
    )


def test_limits_are_per_user_not_per_address(client: TestClient, make_user) -> None:
    """Many people behind one carrier address must not throttle each other."""
    abuser, bystander = make_user("abuser@example.com"), make_user("bystander@example.com")
    household = create_household(client, abuser)
    stranger = uuid.uuid4()

    for _ in range(5):
        client.delete(f"{API}/households/{household}/members/{stranger}", headers=auth(abuser))

    assert (
        client.delete(
            f"{API}/households/{household}/members/{stranger}", headers=auth(abuser)
        ).status_code
        == 429
    )
    assert (
        client.get(f"{API}/users/me", headers=auth(bystander)).status_code == 200
    )  # same address, unaffected
    other = create_household(client, bystander, "Other")
    assert (
        client.delete(
            f"{API}/households/{other}/members/{stranger}", headers=auth(bystander)
        ).status_code
        != 429
    )


def test_junk_tokens_cannot_be_used_to_dodge_the_limit_and_are_charged_to_their_address(
    client: TestClient,
) -> None:
    statuses = [client.delete(f"{API}/users/me", headers=JUNK).status_code for _ in range(7)]

    assert statuses == [401] * 5 + [429] * 2


def test_the_destructive_actions_share_a_tight_budget(client: TestClient, make_user) -> None:
    dad, mom, _, household = household_with(client, make_user)
    for _ in range(4):
        client.patch(
            member_url(household, mom), json={"relationship": "MOTHER"}, headers=auth(dad)
        )  # writes: separate budget

    attempts = [
        client.delete(f"{API}/households/{household}", headers=auth(dad)).status_code
        for _ in range(6)
    ]

    assert (
        attempts[:5] == [409] * 5
    )  # refused for a real reason (others are still in it) but counted
    assert attempts[5] == 429


def test_inviting_members_has_its_own_hourly_budget(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")
    household = create_household(client, dad)

    statuses = [
        client.post(
            f"{API}/households/{household}/members",
            json={"email": f"x{i}@example.com"},
            headers=auth(dad),
        ).status_code
        for i in range(11)
    ]

    assert statuses[:10] == [404] * 10  # no such users: this is the enumeration being capped
    assert statuses[10] == 429


def test_creating_households_has_a_daily_budget(client: TestClient, make_user) -> None:
    dad = make_user("dad@example.com")

    statuses = [
        client.post(f"{API}/households", json={"name": f"H{i}"}, headers=auth(dad)).status_code
        for i in range(6)
    ]

    assert statuses == [201] * 5 + [429]


# ----------------------------------------------------------------- spoofing and configuration


def test_rotating_a_forwarded_header_does_not_escape_the_limit_by_default(
    client: TestClient,
) -> None:
    statuses = [
        google(client, headers={"X-Forwarded-For": f"198.51.100.{i}"}).status_code
        for i in range(11)
    ]

    assert statuses[-1] == 429


def test_behind_a_trusted_proxy_each_real_client_gets_its_own_bucket(
    client: TestClient, settings_env
) -> None:
    settings_env(TRUSTED_PROXY_COUNT="1")

    statuses = [
        google(client, headers={"X-Forwarded-For": f"198.51.100.{i}"}).status_code
        for i in range(15)
    ]

    assert 429 not in statuses  # fifteen different clients, each well under ten
    repeat = [
        google(client, headers={"X-Forwarded-For": "198.51.100.200"}).status_code for _ in range(11)
    ]
    assert repeat[-1] == 429  # but one client is still capped


def test_limiting_can_be_switched_off(client: TestClient, settings_env) -> None:
    settings_env(RATE_LIMIT_ENABLED="false")

    responses = [google(client) for _ in range(15)]

    assert all(r.status_code == 401 for r in responses)
    assert "x-ratelimit-limit" not in responses[0].headers


def test_rejections_are_logged_with_a_hash_of_the_caller_never_the_address(
    client: TestClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING, logger="festiveos")

    for _ in range(11):
        google(client, headers={"X-Forwarded-For": "203.0.113.77"})

    records = [r for r in caplog.records if r.name == "festiveos.ratelimit"]
    assert len(records) == 1
    assert records[0].fields["policy"] == "auth.sign_in"
    assert records[0].fields["scope"] == "ip"
    assert "203.0.113.77" not in caplog.text
    assert "testclient" not in caplog.text


@pytest.mark.parametrize(
    ("name", "value", "message"),
    [
        ("RATE_LIMIT_ENABLED", "maybe", "true or false"),
        ("TRUSTED_PROXY_COUNT", "-1", "negative"),
        ("TRUSTED_PROXY_COUNT", "two", "whole number"),
        ("MAX_REQUEST_BYTES", "0", "greater than zero"),
    ],
)
def test_bad_rate_limit_settings_fail_at_startup(
    settings_env, name: str, value: str, message: str
) -> None:
    from festiveos.config import get_settings

    settings_env(**{name: value})

    with pytest.raises(RuntimeError, match=message):
        get_settings()


def test_the_redis_url_is_optional_and_blank_means_unset(settings_env) -> None:
    from festiveos.config import get_settings

    settings_env(RATE_LIMIT_REDIS_URL="   ")

    assert get_settings().rate_limit_redis_url is None
