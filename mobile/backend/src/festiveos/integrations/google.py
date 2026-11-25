from collections.abc import Callable
from dataclasses import dataclass

from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from festiveos.config import get_settings
from festiveos.core.errors import UnauthorizedError


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str | None
    picture: str | None


GoogleVerifier = Callable[[str], GoogleIdentity]


def verify_google_id_token(token: str) -> GoogleIdentity:
    # Checks signature, expiry, issuer and that the audience is one of our clients.
    try:
        claims = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            audience=list(get_settings().google_client_ids),
        )
    except (GoogleAuthError, ValueError) as exc:
        raise UnauthorizedError("Invalid Google credential") from exc

    if not claims.get("email") or not claims.get("email_verified"):
        raise UnauthorizedError("Google account email is not verified")

    return GoogleIdentity(
        sub=claims["sub"],
        email=claims["email"].strip().lower(),
        name=claims.get("name"),
        picture=claims.get("picture"),
    )


def get_google_verifier() -> GoogleVerifier:
    return verify_google_id_token
