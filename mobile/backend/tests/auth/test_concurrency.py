import threading
from collections.abc import Callable
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from festiveos.auth.repository import AuthRepository
from festiveos.auth.service import AuthService
from festiveos.core.errors import UnauthorizedError
from festiveos.users.models import User
from festiveos.users.repository import UserRepository
from tests.support import TEST_DATABASE_URL, fake_google_verifier

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL, reason="needs real Postgres: set TEST_DATABASE_URL"
)


def run_in_parallel(session_factory: sessionmaker[Session], work: Callable[[Session], Any], n=2):
    outcomes: list[Any] = []

    def worker() -> None:
        with session_factory() as session:
            try:
                outcomes.append(work(session))
            except Exception as exc:
                outcomes.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(n)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)
    return outcomes


def test_concurrent_first_sign_in_creates_exactly_one_user(
    session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    barrier = threading.Barrier(2, timeout=10)
    original = UserRepository.get_by_email

    def both_see_no_user(self: UserRepository, email: str):
        found = original(self, email)
        barrier.wait()
        return found

    monkeypatch.setattr(UserRepository, "get_by_email", both_see_no_user)

    outcomes = run_in_parallel(
        session_factory,
        lambda s: AuthService(s, fake_google_verifier).sign_in_with_google(
            "google:g1:a@example.com"
        ),
    )

    assert [type(o).__name__ for o in outcomes] == ["AuthResult", "AuthResult"]
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(User)) == 1


def test_concurrent_refresh_of_one_token_succeeds_exactly_once(
    session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    with session_factory() as session:
        issued = AuthService(session, fake_google_verifier).sign_in_with_google(
            "google:g1:a@example.com"
        )

    barrier = threading.Barrier(2, timeout=10)
    original = AuthRepository.get_token_by_hash

    def both_see_active_token(self: AuthRepository, token_hash: str):
        stored = original(self, token_hash)
        barrier.wait()
        return stored

    monkeypatch.setattr(AuthRepository, "get_token_by_hash", both_see_active_token)

    outcomes = run_in_parallel(
        session_factory,
        lambda s: AuthService(s, fake_google_verifier).refresh(issued.refresh_token),
    )

    kinds = sorted(type(o).__name__ for o in outcomes)
    assert kinds == ["AuthResult", "UnauthorizedError"]
    assert any(isinstance(o, UnauthorizedError) for o in outcomes)
