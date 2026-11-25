import uuid
from datetime import datetime

from sqlalchemy import delete, exists, select, update
from sqlalchemy.orm import Session

from festiveos.auth.models import AuthSession, RefreshToken
from festiveos.users.models import User


class AuthRepository:
    """Sessions and refresh tokens."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_user_for_session(self, user_id: uuid.UUID, session_id: uuid.UUID) -> User | None:
        """The user, but only if the session is theirs and has not been revoked."""
        return self._session.scalar(
            select(User)
            .join(AuthSession, AuthSession.user_id == User.id)
            .where(
                User.id == user_id,
                AuthSession.id == session_id,
                AuthSession.revoked_at.is_(None),
            )
        )

    def add_session(self, session: AuthSession) -> None:
        self._session.add(session)
        self._session.flush()

    def add_token(self, token: RefreshToken) -> None:
        self._session.add(token)

    def get_token_by_hash(self, token_hash: str) -> RefreshToken | None:
        return self._session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )

    def lock_session(self, session_id: uuid.UUID) -> AuthSession | None:
        """Take the session's row lock. Do this before touching any of its refresh tokens."""
        return self._session.scalar(
            select(AuthSession)
            .where(AuthSession.id == session_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )

    def purge_expired(self, user_id: uuid.UUID, now: datetime) -> None:
        """Housekeeping: drop dead sessions (their tokens go with them), then stale tokens.

        Rows another transaction is working on are skipped, never waited for, so this can
        neither block a request nor deadlock with one. They are collected on a later call.
        """
        dead = list(
            self._session.scalars(
                select(AuthSession.id)
                .where(
                    AuthSession.user_id == user_id,
                    ~exists().where(
                        RefreshToken.session_id == AuthSession.id, RefreshToken.expires_at >= now
                    ),
                )
                .order_by(AuthSession.id)
                .with_for_update(skip_locked=True)
            )
        )
        if dead:
            self._session.execute(
                delete(AuthSession)
                .where(AuthSession.id.in_(dead))
                .execution_options(synchronize_session=False)
            )
        stale = list(
            self._session.scalars(
                select(RefreshToken.id)
                .where(RefreshToken.user_id == user_id, RefreshToken.expires_at < now)
                .order_by(RefreshToken.id)
                .with_for_update(skip_locked=True)
            )
        )
        if stale:
            self._session.execute(
                delete(RefreshToken)
                .where(RefreshToken.id.in_(stale))
                .execution_options(synchronize_session=False)
            )

    def delete_sessions_for_user(self, user_id: uuid.UUID) -> None:
        """Delete every session (and, by cascade, its tokens) in id order, session first."""
        ids = list(
            self._session.scalars(
                select(AuthSession.id)
                .where(AuthSession.user_id == user_id)
                .order_by(AuthSession.id)
                .with_for_update()
            )
        )
        if ids:
            self._session.execute(
                delete(AuthSession)
                .where(AuthSession.id.in_(ids))
                .execution_options(synchronize_session=False)
            )

    def revoke_token_if_active(self, token_id: uuid.UUID, now: datetime) -> bool:
        """Atomic compare-and-set: True only for the one caller that actually rotated it."""
        result = self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.id == token_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        return result.rowcount == 1

    def revoke_session(self, session_id: uuid.UUID, now: datetime) -> None:
        """End a session: its access tokens fail the per-request check, its refresh tokens die."""
        self._session.execute(
            update(AuthSession)
            .where(AuthSession.id == session_id, AuthSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        self._session.execute(
            update(RefreshToken)
            .where(RefreshToken.session_id == session_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
