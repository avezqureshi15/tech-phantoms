from collections.abc import Callable
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from festiveos.auth.repository import AuthRepository
from festiveos.auth.service import AuthService
from festiveos.core.errors import UnauthorizedError
from festiveos.core.log import set_request_user
from festiveos.core.security import decode_access_token
from festiveos.db.dependencies import SessionDep
from festiveos.integrations.flags import FeatureFlags, feature_off, get_feature_flags
from festiveos.integrations.google import GoogleVerifier, get_google_verifier
from festiveos.users.models import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    session: SessionDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None:
        raise UnauthorizedError("Not authenticated")
    claims = decode_access_token(credentials.credentials)
    # One indexed query: the user, provided the token's session is theirs and still live.
    user = AuthRepository(session).get_user_for_session(claims.user_id, claims.session_id)
    if user is None:
        raise UnauthorizedError("Not authenticated")
    set_request_user(user.id)
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_auth_service(
    session: SessionDep,
    verifier: Annotated[GoogleVerifier, Depends(get_google_verifier)],
) -> AuthService:
    return AuthService(session, verifier)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def require_feature(*names: str) -> Callable[..., None]:
    """A route dependency that answers 503 while any of these features is switched off (for this
    person). The app hides what is off, but this is what actually enforces it."""

    def check(
        user: CurrentUser, flags: Annotated[FeatureFlags, Depends(get_feature_flags)]
    ) -> None:
        evaluated = flags.for_user(str(user.id))
        for name in names:
            if not evaluated.enabled(name):
                raise feature_off(name)

    return check
