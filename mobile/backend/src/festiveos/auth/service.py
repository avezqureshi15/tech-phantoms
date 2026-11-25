import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from festiveos.auth.models import AuthSession, RefreshToken
from festiveos.auth.repository import AuthRepository
from festiveos.config import get_settings
from festiveos.core.errors import ConflictError, UnauthorizedError
from festiveos.core.log import logged_service
from festiveos.core.security import create_access_token, hash_token, new_refresh_token
from festiveos.integrations.google import GoogleIdentity, GoogleVerifier
from festiveos.users.models import User
from festiveos.users.repository import UserRepository


@dataclass(frozen=True)
class AuthResult:
    user: User
    access_token: str
    refresh_token: str
    expires_in: int


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


@logged_service
class AuthService:
    def __init__(self, session: Session, verify_google: GoogleVerifier) -> None:
        self._session = session
        self._verify_google = verify_google
        self._users = UserRepository(session)
        self._auth = AuthRepository(session)

    def sign_in_with_google(self, google_id_token: str) -> AuthResult:
        identity = self._verify_google(google_id_token)

        try:
            user = self._find_or_create(identity)
            result = self._issue(user)
            self._session.commit()
        except IntegrityError as exc:
            # A concurrent request (a double-tap, a retry) created the user first. The
            # same Google identity is the same person, so sign in as that user.
            self._session.rollback()
            user = self._users.get_by_google_sub(identity.sub)
            if user is None:
                raise ConflictError("Could not complete sign-in, please retry") from exc
            result = self._issue(user)
            self._session.commit()
        return result

    def _find_or_create(self, identity: GoogleIdentity) -> User:
        user = self._users.get_by_google_sub(identity.sub)
        if user is not None:
            return user

        user = self._users.get_by_email(identity.email)
        if user is None:
            return self._users.add(
                User(
                    name=identity.name or identity.email.split("@")[0],
                    email=identity.email,
                    avatar_url=identity.picture,
                    google_sub=identity.sub,
                )
            )

        # Only an account that was never linked to Google may be claimed by email. A
        # different Google identity with the same address (a recycled Workspace
        # domain, say) must not inherit the existing account.
        if user.google_sub is not None:
            raise ConflictError("This email is already linked to a different Google account")
        user.google_sub = identity.sub
        return user

    def refresh(self, raw_refresh_token: str) -> AuthResult:
        now = datetime.now(UTC)
        stored = self._auth.get_token_by_hash(hash_token(raw_refresh_token))
        if stored is None:
            raise UnauthorizedError("Invalid refresh token")

        # Lock order: the session before any of its tokens, as everywhere else. Then re-read
        # the token, because it may have changed while we waited for the lock.
        if self._auth.lock_session(stored.session_id) is None:
            raise UnauthorizedError("Invalid refresh token")
        self._session.refresh(stored)

        if stored.revoked_at is not None:
            # A rotated (or logged-out) token was replayed: assume theft and end that session.
            self._auth.revoke_session(stored.session_id, now)
            self._session.commit()
            raise UnauthorizedError("Invalid refresh token")

        if _aware(stored.expires_at) <= now:
            raise UnauthorizedError("Refresh token expired")

        user = self._auth.get_user_for_session(stored.user_id, stored.session_id)
        if user is None:
            raise UnauthorizedError("Invalid refresh token")

        # Atomic compare-and-set: if a concurrent request rotated this token first,
        # zero rows change and we treat it as reuse instead of issuing a second pair.
        if not self._auth.revoke_token_if_active(stored.id, now):
            self._auth.revoke_session(stored.session_id, now)
            self._session.commit()
            raise UnauthorizedError("Invalid refresh token")

        result = self._issue(user, session_id=stored.session_id)
        self._session.commit()
        return result

    def logout(self, raw_refresh_token: str) -> None:
        stored = self._auth.get_token_by_hash(hash_token(raw_refresh_token))
        if stored is not None:
            # Ending the session also invalidates every access token issued under it.
            self._auth.revoke_session(stored.session_id, datetime.now(UTC))
            self._session.commit()

    def _issue(self, user: User, session_id: uuid.UUID | None = None) -> AuthResult:
        """Mint a token pair; a new sign-in starts a session, a refresh continues one."""
        settings = get_settings()
        raw = new_refresh_token()
        # An expired token can't be replayed, so keeping it only grows the table.
        self._auth.purge_expired(user.id, datetime.now(UTC))
        if session_id is None:
            login = AuthSession(user_id=user.id)
            self._auth.add_session(login)
            session_id = login.id
        self._auth.add_token(
            RefreshToken(
                user_id=user.id,
                session_id=session_id,
                token_hash=hash_token(raw),
                expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
            )
        )
        return AuthResult(
            user=user,
            access_token=create_access_token(user.id, session_id),
            refresh_token=raw,
            expires_in=settings.access_token_minutes * 60,
        )
