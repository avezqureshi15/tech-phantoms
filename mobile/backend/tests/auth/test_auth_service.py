from datetime import UTC, datetime

import pytest
from sqlalchemy import update
from sqlalchemy.orm import Session, sessionmaker

from festiveos.auth.models import AuthSession, RefreshToken
from festiveos.auth.repository import AuthRepository
from festiveos.auth.service import AuthService
from festiveos.core.errors import UnauthorizedError
from tests.support import fake_google_verifier


def test_refresh_fails_if_token_is_revoked_by_a_concurrent_request(
    session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    with session_factory() as session:
        issued = AuthService(session, fake_google_verifier).sign_in_with_google(
            "google:g1:a@example.com"
        )

    original = AuthRepository.get_token_by_hash

    def lookup_then_lose_the_race(self: AuthRepository, token_hash: str):
        stored = original(self, token_hash)
        with session_factory() as other:
            other.execute(
                update(RefreshToken)
                .where(RefreshToken.token_hash == token_hash)
                .values(revoked_at=datetime.now(UTC))
            )
            other.commit()
        return stored

    monkeypatch.setattr(AuthRepository, "get_token_by_hash", lookup_then_lose_the_race)

    with session_factory() as session, pytest.raises(UnauthorizedError):
        AuthService(session, fake_google_verifier).refresh(issued.refresh_token)


def test_expired_refresh_tokens_are_purged_on_next_sign_in(
    session_factory: sessionmaker[Session],
) -> None:
    from datetime import timedelta

    from sqlalchemy import func, select

    with session_factory() as session:
        service = AuthService(session, fake_google_verifier)
        first = service.sign_in_with_google("google:g1:a@example.com")
        dead = AuthSession(user_id=first.user.id)
        session.add(dead)
        session.flush()
        for i in range(3):
            session.add(
                RefreshToken(
                    user_id=first.user.id,
                    session_id=dead.id,
                    token_hash=f"{i}" * 64,
                    expires_at=datetime.now(UTC) - timedelta(days=1),
                )
            )
        session.commit()
        dead_id = dead.id

        service.sign_in_with_google("google:g1:a@example.com")

        expired = session.scalar(
            select(func.count())
            .select_from(RefreshToken)
            .where(RefreshToken.expires_at < datetime.now(UTC))
        )
        orphaned = session.scalar(select(AuthSession).where(AuthSession.id == dead_id))
    assert expired == 0
    assert orphaned is None  # a session whose tokens have all expired is dead too
