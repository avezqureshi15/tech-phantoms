from pydantic import BaseModel, Field, field_validator

from festiveos.core.faiths import Faith
from festiveos.core.schemas import InputModel


class ProfileUpdate(InputModel):
    """Only what the person sets about themselves; sending ``faiths`` (even empty) records that
    they have answered, so the app stops asking."""

    faiths: list[Faith] | None = Field(default=None, max_length=len(Faith))
    home_city: str | None = Field(default=None, pattern=r"^[a-z_]{1,32}$")

    @field_validator("faiths")
    @classmethod
    def unique(cls, values: list[Faith] | None) -> list[Faith] | None:
        return None if values is None else list(dict.fromkeys(values))


class FeaturesRead(BaseModel):
    """What is switched on for this person, so the app can hide what is off."""

    features: dict[str, bool]
    announcement: str | None
