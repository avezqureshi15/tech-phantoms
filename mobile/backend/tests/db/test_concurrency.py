"""Deadlock tests on real Postgres.

Each test forces the interleaving that used to be able to deadlock, by pausing one transaction
at a chosen statement while another runs. A deadlock shows up as SQLSTATE 40P01.

The lock order everything must follow (see docs/concurrency.md):
    household -> household members -> auth session -> refresh tokens -> user
"""

import random
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from festiveos.accounts.service import AccountService
from festiveos.auth.models import AuthSession, RefreshToken
from festiveos.auth.service import AuthService
from festiveos.core.log import EXPECTED_ERRORS
from festiveos.core.security import hash_token
from festiveos.households.service import HouseholdService
from festiveos.traditions.schemas import OccurrenceCreate
from festiveos.traditions.service import TraditionService
from festiveos.users.models import User
from tests.support import (
    API,
    TEST_DATABASE_URL,
    auth,
    create_festival,
    create_tradition,
    fake_google_verifier,
    setup_household,
)

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="needs real Postgres")

DEADLOCK = "40P01"


def is_deadlock(outcome: object) -> bool:
    return isinstance(outcome, DBAPIError) and getattr(outcome.orig, "sqlstate", None) == DEADLOCK


def run(jobs: dict[str, Callable[[], object]], timeout: float = 20) -> dict[str, object]:
    """Run each job in its own named thread; return the result or the exception of each."""
    outcomes: dict[str, object] = {}

    def wrap(name: str, job: Callable[[], object]) -> None:
        try:
            outcomes[name] = job()
        except BaseException as exc:
            outcomes[name] = exc

    threads = [threading.Thread(target=wrap, args=(n, j), name=n) for n, j in jobs.items()]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout)
    assert not any(t.is_alive() for t in threads), (
        "a job hung: that is a deadlock Postgres never resolved"
    )
    return outcomes


@contextmanager
def pause_before(
    engine: Engine, thread: str, statement_prefix: str, reached: threading.Event, hold: float = 0.6
) -> Iterator[None]:
    """Make `thread` sleep once, just before it runs a statement starting with the prefix."""
    fired = threading.Event()

    def listener(conn, cursor, statement, parameters, context, executemany):
        if (
            threading.current_thread().name == thread
            and statement.lstrip().startswith(statement_prefix)
            and not fired.is_set()
        ):
            fired.set()
            reached.set()
            time.sleep(hold)

    event.listen(engine, "before_cursor_execute", listener)
    try:
        yield
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    assert fired.is_set(), f"{thread} never ran a statement starting with {statement_prefix!r}"


def assert_no_deadlock(outcomes: dict[str, object]) -> None:
    deadlocked = {name: o for name, o in outcomes.items() if is_deadlock(o)}
    assert not deadlocked, f"deadlock detected in: {sorted(deadlocked)}"
    # Losing a race may legitimately end in a domain error (not found, conflict, unauthorized...).
    # What must never happen is an unexpected exception.
    unexpected = {
        n: o
        for n, o in outcomes.items()
        if isinstance(o, BaseException) and not isinstance(o, EXPECTED_ERRORS)
    }
    assert not unexpected, unexpected


def sign_in(session_factory: sessionmaker[Session], email: str):
    with session_factory() as session:
        return AuthService(session, fake_google_verifier).sign_in_with_google(f"google:g1:{email}")


# ------------------------------------------------------------------- auth: session before tokens


def test_purging_dead_sessions_does_not_deadlock_with_a_logout(
    session_factory: sessionmaker[Session], engine: Engine
) -> None:
    first = sign_in(session_factory, "a@example.com")
    with session_factory() as session:  # a dead session: its only token has long expired
        dead = AuthSession(user_id=first.user.id)
        session.add(dead)
        session.flush()
        session.add(
            RefreshToken(
                user_id=first.user.id,
                session_id=dead.id,
                token_hash=hash_token("dead-session-token"),
                expires_at=datetime.now(UTC) - timedelta(days=1),
            )
        )
        session.commit()
    reached = threading.Event()

    def sign_in_again() -> object:
        return sign_in(session_factory, "a@example.com")  # its housekeeping purges the dead session

    def logout_dead_session() -> None:
        reached.wait(5)
        with session_factory() as session:
            AuthService(session, fake_google_verifier).logout("dead-session-token")

    with pause_before(engine, "sign_in", "DELETE FROM auth_sessions", reached):
        outcomes = run({"sign_in": sign_in_again, "logout": logout_dead_session})

    assert_no_deadlock(outcomes)


def test_refresh_and_account_deletion_do_not_deadlock(
    session_factory: sessionmaker[Session], engine: Engine
) -> None:
    issued = sign_in(session_factory, "a@example.com")
    reached = threading.Event()

    def refresh() -> object:
        with session_factory() as session:
            return AuthService(session, fake_google_verifier).refresh(issued.refresh_token)

    def delete_account() -> None:
        reached.wait(5)
        with session_factory() as session:
            AccountService(session).delete(session.get(User, issued.user.id))

    with pause_before(engine, "refresh", "INSERT INTO refresh_tokens", reached):
        outcomes = run({"refresh": refresh, "delete": delete_account})

    assert_no_deadlock(outcomes)


def test_logout_and_account_deletion_do_not_deadlock(
    session_factory: sessionmaker[Session], engine: Engine
) -> None:
    issued = sign_in(session_factory, "a@example.com")
    reached = threading.Event()

    def logout() -> None:
        with session_factory() as session:
            AuthService(session, fake_google_verifier).logout(issued.refresh_token)

    def delete_account() -> None:
        reached.wait(5)
        with session_factory() as session:
            AccountService(session).delete(session.get(User, issued.user.id))

    with pause_before(engine, "logout", "UPDATE refresh_tokens", reached):
        outcomes = run({"logout": logout, "delete": delete_account})

    assert_no_deadlock(outcomes)


def test_concurrent_auth_operations_never_deadlock(session_factory: sessionmaker[Session]) -> None:
    rng = random.Random(7)  # noqa: S311  (a reproducible shuffle, not security)
    for round_number in range(25):
        email = f"user{round_number}@example.com"
        issued = sign_in(session_factory, email)

        def refresh(token: str = issued.refresh_token) -> object:
            with session_factory() as session:
                return AuthService(session, fake_google_verifier).refresh(token)

        def logout(token: str = issued.refresh_token) -> None:
            with session_factory() as session:
                AuthService(session, fake_google_verifier).logout(token)

        def delete(user_id=issued.user.id) -> None:
            with session_factory() as session:
                if (user := session.get(User, user_id)) is not None:
                    AccountService(session).delete(user)

        jobs = {
            "refresh_a": refresh,
            "refresh_b": refresh,
            "logout": logout,
            "sign_in": lambda email=email: sign_in(session_factory, email),
            "delete": delete,
        }
        names = list(jobs)
        rng.shuffle(names)
        assert_no_deadlock(run({n: jobs[n] for n in names}))


# ----------------------------------------------- households: household before festivals/traditions


def seed_household(client, make_user):
    dad, _, household_id = setup_household(client, make_user)
    festival = create_festival(client, dad, household_id)
    tradition = create_tradition(client, dad, household_id)
    return dad, household_id, festival, tradition


def test_recording_a_tradition_locks_the_household_before_its_children(
    client, make_user, session_factory: sessionmaker[Session], engine: Engine
) -> None:
    dad, _, festival, tradition = seed_household(client, make_user)
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(" ".join(statement.split()))

    event.listen(engine, "before_cursor_execute", record)
    try:
        with session_factory() as session:
            TraditionService(session).record_occurrence(
                session.get(User, dad.id),
                __import__("uuid").UUID(tradition["id"]),
                OccurrenceCreate(festival_id=__import__("uuid").UUID(festival["id"])),
            )
    finally:
        event.remove(engine, "before_cursor_execute", record)

    household_lock = next(
        i for i, s in enumerate(statements) if "FROM households" in s and "FOR KEY SHARE" in s
    )
    insert = next(
        i for i, s in enumerate(statements) if s.startswith("INSERT INTO tradition_occurrences")
    )
    assert household_lock < insert


def test_recording_traditions_and_deleting_the_household_never_deadlock(
    client, make_user, session_factory: sessionmaker[Session]
) -> None:
    import uuid

    for round_number in range(20):
        dad = make_user(f"solo{round_number}@example.com")
        household_id = client.post(
            f"{API}/households", json={"name": "Solo"}, headers=auth(dad)
        ).json()["id"]
        festival = create_festival(client, dad, household_id)
        traditions = [create_tradition(client, dad, household_id, name=f"T{i}") for i in range(3)]

        def record(tradition_id: str, festival_id: str = festival["id"], user_id=dad.id) -> object:
            with session_factory() as session:
                return TraditionService(session).record_occurrence(
                    session.get(User, user_id),
                    uuid.UUID(tradition_id),
                    OccurrenceCreate(festival_id=uuid.UUID(festival_id)),
                )

        def delete_household(hid: str = household_id, user_id=dad.id) -> None:
            with session_factory() as session:
                HouseholdService(session).delete(session.get(User, user_id), uuid.UUID(hid))

        jobs: dict[str, Callable[[], object]] = {
            f"record_{i}": (lambda t=t: record(t["id"])) for i, t in enumerate(traditions)
        }
        jobs["delete"] = delete_household
        outcomes = run(jobs)

        assert not [n for n, o in outcomes.items() if is_deadlock(o)], outcomes
