"""Body size limit, security headers, health checks, and the global per-IP backstop."""

import logging

import pytest
from fastapi.testclient import TestClient

from festiveos.core.limits import GLOBAL_PER_IP
from festiveos.core.ratelimit import Limit
from festiveos.db.session import get_session
from festiveos.main import create_app
from tests.support import API


def test_every_response_is_marked_uncacheable_and_not_sniffable(client: TestClient) -> None:
    for response in (
        client.get("/health"),
        client.get(f"{API}/households"),
        client.get("/nowhere"),
    ):
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"


# ------------------------------------------------------------------------------ body size


def test_an_oversized_body_is_refused_by_its_declared_length(client: TestClient) -> None:
    response = client.post(
        f"{API}/auth/google", content=b"x" * 300_000, headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "Request body too large"
    assert response.json()["request_id"] == response.headers["x-request-id"]


def test_an_oversized_body_is_refused_even_when_streamed_without_a_length(
    client: TestClient,
) -> None:
    def chunks():
        for _ in range(40):
            yield b"x" * 10_000  # 400 KB, no Content-Length

    response = client.post(
        f"{API}/auth/google", content=chunks(), headers={"Content-Type": "application/json"}
    )

    assert response.status_code == 413


def test_a_normal_body_is_unaffected(client: TestClient) -> None:
    response = client.post(f"{API}/auth/google", json={"id_token": "google:g1:a@example.com"})

    assert response.status_code == 200


def test_the_limit_is_configurable(client: TestClient, settings_env) -> None:
    settings_env(MAX_REQUEST_BYTES="100")

    response = client.post(f"{API}/auth/google", json={"id_token": "g" * 200})

    assert response.status_code == 413


# ------------------------------------------------------------------------------ health


def test_liveness_never_touches_the_database_but_readiness_does() -> None:
    app = create_app()

    def broken_database():
        raise RuntimeError("database is down")

    app.dependency_overrides[get_session] = broken_database
    probe = TestClient(app, raise_server_exceptions=False)

    assert probe.get("/health/live").json() == {"status": "ok"}
    assert probe.get("/health/ready").status_code == 500
    assert probe.get("/health").status_code == 500


def test_readiness_reports_the_database(client: TestClient) -> None:
    assert client.get("/health/ready").json() == {"status": "ok", "database": "up"}


def test_health_endpoints_are_limited_per_address(client: TestClient) -> None:
    statuses = [client.get("/health/live").status_code for _ in range(62)]

    assert statuses.count(200) == 60
    assert statuses[-2:] == [429, 429]


# --------------------------------------------------------------------- global per-IP backstop


def test_the_global_ceiling_applies_to_every_request_even_unknown_routes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setattr("festiveos.core.guards.GLOBAL_PER_IP", Limit(GLOBAL_PER_IP.name, 3, 60))
    caplog.set_level(logging.WARNING, logger="festiveos")

    statuses = [client.get("/no/such/route").status_code for _ in range(5)]

    assert statuses == [404, 404, 404, 429, 429]
    rejected = client.get("/no/such/route")
    assert rejected.headers["retry-after"].isdigit()
    assert rejected.json()["request_id"] == rejected.headers["x-request-id"]
    assert any(
        r.name == "festiveos.ratelimit" and r.fields["policy"] == "global" for r in caplog.records
    )
