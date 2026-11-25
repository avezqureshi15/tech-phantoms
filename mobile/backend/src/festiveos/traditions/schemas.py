import uuid
from datetime import UTC, datetime, timedelta
from enum import StrEnum

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
)

from festiveos.core.schemas import InputModel
from festiveos.users.schemas import UserSummary

CLOCK_SKEW = timedelta(minutes=5)


def _year_not_in_future(value: int | None) -> int | None:
    # Evaluated per request, so a long-running server never goes stale at New Year.
    if value is not None and value > datetime.now(UTC).year:
        raise ValueError("started_year cannot be in the future")
    return value


class TraditionCategory(StrEnum):
    RITUAL = "RITUAL"
    FOOD = "FOOD"
    DECORATION = "DECORATION"
    CLOTHING = "CLOTHING"
    FAMILY = "FAMILY"
    RELIGIOUS = "RELIGIOUS"
    SOCIAL = "SOCIAL"
    MUSIC = "MUSIC"
    GIFTING = "GIFTING"
    TRAVEL = "TRAVEL"
    CUSTOM = "CUSTOM"


class TraditionScope(StrEnum):
    GLOBAL = "global"
    REGIONAL = "regional"
    COMMUNITY = "community"
    FAMILY = "family"


class TraditionCreate(InputModel):
    festival_type: str = Field(pattern=r"^[A-Z_]{2,32}$")
    name: str = Field(min_length=1, max_length=120)
    category: TraditionCategory
    scope: TraditionScope = TraditionScope.FAMILY
    description: str | None = Field(default=None, max_length=2000)
    origin: str | None = Field(default=None, max_length=2000)
    significance: str | None = Field(default=None, max_length=2000)
    instructions: str | None = Field(default=None, max_length=4000)
    region: str | None = Field(default=None, max_length=64)
    started_year: int | None = Field(default=None, ge=1)

    _check_year = field_validator("started_year")(_year_not_in_future)


class TraditionUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: TraditionCategory | None = None
    scope: TraditionScope | None = None
    description: str | None = Field(default=None, max_length=2000)
    origin: str | None = Field(default=None, max_length=2000)
    significance: str | None = Field(default=None, max_length=2000)
    instructions: str | None = Field(default=None, max_length=4000)
    region: str | None = Field(default=None, max_length=64)
    started_year: int | None = Field(default=None, ge=1)
    active: bool | None = None

    _check_year = field_validator("started_year")(_year_not_in_future)

    @model_validator(mode="after")
    def required_fields_cannot_be_null(self) -> "TraditionUpdate":
        for name in self.model_fields_set & {"name", "category", "scope", "active"}:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class OccurrenceCreate(InputModel):
    festival_id: uuid.UUID
    performed_by: uuid.UUID | None = None
    completed_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=2000)
    photo_url: HttpUrl | None = None

    @field_validator("completed_at")
    @classmethod
    def not_in_future(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return value
        aware = value if value.tzinfo else value.replace(tzinfo=UTC)
        if aware > datetime.now(UTC) + CLOCK_SKEW:
            raise ValueError("completed_at cannot be in the future")
        return value


class OccurrenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    festival_id: uuid.UUID
    festival_name: str
    year: int
    performer: UserSummary | None
    completed_at: datetime | None
    notes: str | None
    photo_url: str | None


class TraditionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    festival_type: str
    name: str
    category: str
    scope: str
    description: str | None
    origin: str | None
    significance: str | None
    instructions: str | None
    region: str | None
    started_year: int | None
    active: bool
    created_by: uuid.UUID | None


class TraditionDetail(TraditionRead):
    occurrences: list[OccurrenceRead]


class ChecklistItem(BaseModel):
    """One tradition on a festival's checklist, with whether and by whom it was done."""

    tradition: TraditionRead
    occurrence_id: uuid.UUID | None
    completed: bool
    completed_at: datetime | None
    performed_by: UserSummary | None
