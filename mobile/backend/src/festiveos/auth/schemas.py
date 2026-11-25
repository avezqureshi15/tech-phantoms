from pydantic import BaseModel, Field

from festiveos.core.schemas import InputModel
from festiveos.users.schemas import UserRead


class GoogleSignIn(InputModel):
    id_token: str = Field(min_length=1)


class RefreshRequest(InputModel):
    refresh_token: str = Field(min_length=1)


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105  (the OAuth token type, not a secret)
    expires_in: int
    user: UserRead
