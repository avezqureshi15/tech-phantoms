"""What happens when the database is busy: bounded waits, clean errors, no pool starvation."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session, sessionmaker

from festiveos.config import get_settings
from festiveos.main import create_app
from tests.support import API, TEST_DATABASE_URL, auth, household_with, member_url

needs_postgres = pytest.mark.skipif(not TEST_DATABASE_URL, reason="needs real Postgres")


class FakeDriverError(Exception):
    def __init__(self, sqlstate: str) -> None:
        super().__init__(f"fake driver error {sqlstate}")
        self.sqlstate = sqlstate


def app_raising(error: Exception) -> TestClient:
    app = create_app()

    @app.get("/fail")
    def fail() -> None:
        raise error

    return TestClient(app)


@pytest.mark.parametrize("sqlstate", ["40P01", "55P03", "40001", "57014"])
def test_retryable_database_errors_become_503_with_retry_after(sqlstate: str) -> None:
    client = app_raising(OperationalError("SELECT secret", {}, FakeDriverError(sqlstate)))

    response = client.get("/fail")

    assert response.status_code == 503
    assert response.headers["retry-after"] == "1"
    assert response.json()["request_id"] == response.headers["x-request-id"]
    assert "secret" not in response.text  # the SQL is not leaked to the caller


def test_other_database_errors_stay_a_generic_500() -> None:
    client = app_raising(IntegrityError("INSERT secret", {}, FakeDriverError("23505")))

    response = client.get("/fail")

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error"
    assert "secret" not in response.text


def test_wait_limits_are_configurable_and_validated(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    assert settings.db_lock_timeout_ms == 1000  # set by the test environment
    assert settings.db_statement_timeout_ms == 30_000

    get_settings.cache_clear()
    monkeypatch.setenv("DB_LOCK_TIMEOUT_MS", "soon")
    try:
        with pytest.raises(RuntimeError, match="DB_LOCK_TIMEOUT_MS"):
            get_settings()
        monkeypatch.setenv("DB_LOCK_TIMEOUT_MS", "0")
        with pytest.raises(RuntimeError, match="greater than zero"):
            get_settings()
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


@needs_postgres
def test_every_transaction_has_bounded_waits(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as session:
        shown = {
            name: session.execute(text(f"SHOW {name}")).scalar()
            for name in ("lock_timeout", "statement_timeout", "idle_in_transaction_session_timeout")
        }

    assert shown == {
        "lock_timeout": "1s",
        "statement_timeout": "30s",
        "idle_in_transaction_session_timeout": "1min",
    }


@needs_postgres
def test_a_stuck_lock_ends_in_503_instead_of_hanging(
    client: TestClient, make_user, engine: Engine
) -> None:
    dad, mom, _, household_id = household_with(client, make_user)

    with engine.connect() as holder, holder.begin():
        holder.execute(
            text("SELECT 1 FROM households WHERE id = :id FOR UPDATE"), {"id": household_id}
        )  # another transaction is sitting on the household
        started = time.monotonic()
        response = client.patch(
            member_url(household_id, mom), json={"relationship": "MOTHER"}, headers=auth(dad)
        )
        waited = time.monotonic() - started

    assert response.status_code == 503
    assert waited < 5  # bounded by DB_LOCK_TIMEOUT_MS, not by the other transaction
    # and once the lock is free the same request succeeds
    retry = client.patch(
        member_url(household_id, mom), json={"relationship": "MOTHER"}, headers=auth(dad)
    )
    assert retry.status_code == 200


def test_a_request_never_holds_two_pool_connections(
    client: TestClient, make_user, engine: Engine
) -> None:
    """Holding one connection while waiting for another is a deadlock the pool cannot detect."""
    dad, mom, _, household_id = household_with(client, make_user)
    festival = client.post(
        f"{API}/households/{household_id}/festivals",
        json={
            "type": "DIWALI",
            "name": "Diwali",
            "start_date": "2026-11-08",
            "end_date": "2026-11-12",
        },
        headers=auth(dad),
    ).json()
    tradition = client.post(
        f"{API}/households/{household_id}/traditions",
        json={"festival_type": "DIWALI", "name": "Diya", "category": "RITUAL"},
        headers=auth(dad),
    ).json()
    in_use = peak = 0

    def checkout(*_: object) -> None:
        nonlocal in_use, peak
        in_use += 1
        peak = max(peak, in_use)

    def checkin(*_: object) -> None:
        nonlocal in_use
        in_use -= 1

    event.listen(engine, "checkout", checkout)
    event.listen(engine, "checkin", checkin)
    try:
        headers = auth(dad)
        for call in (
            lambda: client.get("/health"),
            lambda: client.post(f"{API}/auth/google", json={"id_token": "google:g1:z@example.com"}),
            lambda: client.get(f"{API}/users/me", headers=headers),
            lambda: client.get(f"{API}/households", headers=headers),
            lambda: client.get(f"{API}/households/{household_id}", headers=headers),
            lambda: client.patch(
                member_url(household_id, mom), json={"role": "admin"}, headers=headers
            ),
            lambda: client.get(f"{API}/festivals/{festival['id']}", headers=headers),
            lambda: client.get(f"{API}/festivals/{festival['id']}/checklist", headers=headers),
            lambda: client.get(f"{API}/traditions/{tradition['id']}", headers=headers),
            lambda: client.post(
                f"{API}/traditions/{tradition['id']}/occurrences",
                json={"festival_id": festival["id"]},
                headers=headers,
            ),
            lambda: client.delete(f"{API}/users/me", headers=auth(mom)),
        ):
            call()
    finally:
        event.remove(engine, "checkout", checkout)
        event.remove(engine, "checkin", checkin)

    assert peak == 1
