import uuid
from datetime import date, datetime, time
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from festiveos.core.schemas import InputModel


class FestivalType(StrEnum):
    DIWALI = "DIWALI"
    DUSSEHRA = "DUSSEHRA"
    NAVRATRI = "NAVRATRI"
    GANESH_CHATURTHI = "GANESH_CHATURTHI"
    CHRISTMAS = "CHRISTMAS"
    NEW_YEAR = "NEW_YEAR"
    PONGAL = "PONGAL"
    ONAM = "ONAM"
    HOLI = "HOLI"
    EID = "EID"
    RAKSHA_BANDHAN = "RAKSHA_BANDHAN"
    JANMASHTAMI = "JANMASHTAMI"
    UGADI = "UGADI"
    RAMA_NAVAMI = "RAMA_NAVAMI"
    MAHA_SHIVARATRI = "MAHA_SHIVARATRI"
    AKSHAYA_TRITIYA = "AKSHAYA_TRITIYA"
    MAKAR_SANKRANTI = "MAKAR_SANKRANTI"
    VASANT_PANCHAMI = "VASANT_PANCHAMI"
    DURGA_PUJA = "DURGA_PUJA"
    KARVA_CHAUTH = "KARVA_CHAUTH"
    BUDDHA_PURNIMA = "BUDDHA_PURNIMA"
    MAHAVIR_JAYANTI = "MAHAVIR_JAYANTI"
    PARYUSHAN = "PARYUSHAN"
    VAISAKHI = "VAISAKHI"
    GURPURAB = "GURPURAB"
    BANDI_CHHOR = "BANDI_CHHOR"
    EASTER = "EASTER"
    GOOD_FRIDAY = "GOOD_FRIDAY"
    EPIPHANY = "EPIPHANY"
    RAMADAN = "RAMADAN"
    EID_AL_FITR = "EID_AL_FITR"
    EID_AL_ADHA = "EID_AL_ADHA"
    MUHARRAM = "MUHARRAM"
    MILAD_UN_NABI = "MILAD_UN_NABI"
    NAVROZ = "NAVROZ"
    OTHER = "OTHER"  # a festival of the family's own


class FestivalStatus(StrEnum):
    PLANNING = "planning"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


MAX_FESTIVAL_DAYS = 60


class FestivalCreate(InputModel):
    type: FestivalType
    name: str = Field(min_length=1, max_length=120)
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def end_not_before_start(self) -> "FestivalCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        if (self.end_date - self.start_date).days >= MAX_FESTIVAL_DAYS:
            raise ValueError(f"a festival can span at most {MAX_FESTIVAL_DAYS} days")
        return self


class FestivalUpdate(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    start_date: date | None = None
    end_date: date | None = None
    status: FestivalStatus | None = None

    @model_validator(mode="after")
    def required_fields_cannot_be_null(self) -> "FestivalUpdate":
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        return self


class EventCreate(InputModel):
    name: str = Field(min_length=1, max_length=120)
    event_date: date
    start_time: time | None = None
    end_time: time | None = None
    location: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def end_after_start(self) -> "EventCreate":
        if self.end_time and not self.start_time:
            raise ValueError("end_time requires a start_time")
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    event_date: date
    start_time: time | None
    end_time: time | None
    location: str | None
    description: str | None


class FestivalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    type: str
    name: str
    start_date: date
    end_date: date
    status: str
    readiness_score: int
    created_at: datetime

    @computed_field
    @property
    def year(self) -> int:
        return self.start_date.year


class FestivalDetail(FestivalRead):
    events: list[EventRead]
