import uuid
from datetime import datetime
from enum import StrEnum
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

from festiveos.core.faiths import Faith
from festiveos.core.schemas import InputModel
from festiveos.users.schemas import UserSummary


class Relationship(StrEnum):
    FATHER = "FATHER"
    MOTHER = "MOTHER"
    SON = "SON"
    DAUGHTER = "DAUGHTER"
    GRANDFATHER = "GRANDFATHER"
    GRANDMOTHER = "GRANDMOTHER"
    UNCLE = "UNCLE"
    AUNT = "AUNT"
    COUSIN = "COUSIN"
    BROTHER = "BROTHER"
    SISTER = "SISTER"


class MemberRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class NotificationPreference(StrEnum):
    ALL = "all"
    IMPORTANT = "important"
    NONE = "none"


class GroupKind(StrEnum):
    HOUSEHOLD = "household"
    FRIENDS = "friends"
    OFFICE = "office"
    OTHER = "other"


ICON_PATTERN = r"^(emoji:.{1,16}|symbol:[a-z0-9-]{1,32})$"
COLOR_PATTERN = r"^#[0-9A-Fa-f]{6}$"


def _real_icon(value: str | None) -> str | None:
    """An emoji icon must contain something that is not plain ASCII, so "emoji:abc" is rejected."""
    if value is not None and value.startswith("emoji:") and value.removeprefix("emoji:").isascii():
        raise ValueError("choose an emoji")
    return value


def _unique_faiths(values: list[Faith] | None) -> list[Faith] | None:
    return None if values is None else list(dict.fromkeys(values))


def _known_timezone(value: str | None) -> str | None:
    if value is None:
        return value
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError(f"unknown timezone: {value}") from exc
    return value


class HouseholdCreate(InputModel):
    name: str = Field(min_length=1, max_length=100)
    timezone: str = "Asia/Kolkata"
    location: str | None = Field(default=None, max_length=200)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    default_language: str = Field(default="en", max_length=8)
    faiths: list[Faith] = Field(default_factory=list, max_length=len(Faith))
    panchang_city: str = Field(default="delhi", pattern=r"^[a-z_]{1,32}$")
    kind: GroupKind = GroupKind.HOUSEHOLD
    icon: str | None = Field(default=None, pattern=ICON_PATTERN)
    color: str | None = Field(default=None, pattern=COLOR_PATTERN)

    _check_timezone = field_validator("timezone")(_known_timezone)
    _check_faiths = field_validator("faiths")(_unique_faiths)
    _check_icon = field_validator("icon")(_real_icon)


class HouseholdUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    timezone: str | None = None
    location: str | None = Field(default=None, max_length=200)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    default_language: str | None = Field(default=None, max_length=8)
    faiths: list[Faith] | None = Field(default=None, max_length=len(Faith))
    panchang_city: str | None = Field(default=None, pattern=r"^[a-z_]{1,32}$")
    icon: str | None = Field(default=None, pattern=ICON_PATTERN)
    color: str | None = Field(default=None, pattern=COLOR_PATTERN)

    _check_timezone = field_validator("timezone")(_known_timezone)
    _check_faiths = field_validator("faiths")(_unique_faiths)
    _check_icon = field_validator("icon")(_real_icon)

    @model_validator(mode="after")
    def valid_change(self) -> "HouseholdUpdate":
        if not self.model_fields_set:
            raise ValueError("send at least one field to change")
        # Only the location may be cleared; everything else has a default to fall back to.
        for name in self.model_fields_set - {"location"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class MemberCreate(InputModel):
    email: EmailStr
    relationship: Relationship | None = None
    role: MemberRole = MemberRole.MEMBER
    notification_preference: NotificationPreference = NotificationPreference.ALL


class MemberUpdate(InputModel):
    role: MemberRole | None = None
    relationship: Relationship | None = None
    notification_preference: NotificationPreference | None = None

    @model_validator(mode="after")
    def valid_change(self) -> "MemberUpdate":
        if not self.model_fields_set:
            raise ValueError("send at least one field to change")
        for name in self.model_fields_set & {"role", "notification_preference"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserSummary
    relationship: str | None
    role: str
    notification_preference: str
    joined_at: datetime


class HouseholdRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    created_by: uuid.UUID | None
    timezone: str
    location: str | None
    currency: str
    default_language: str
    faiths: list[str]
    panchang_city: str
    kind: GroupKind
    icon: str | None
    color: str | None
    created_at: datetime


class HouseholdDetail(HouseholdRead):
    members: list[MemberRead]
