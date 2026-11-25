import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from festiveos.core.schemas import InputModel

# What a call back can be about. A closed list: free text goes in ``note``, never in the category.
Topic = Literal["expense_dispute", "group_help", "account_access", "app_problem", "other"]
# The Indian languages a person can ask to be called in. The support platform decides which of these
# it can actually serve and falls back to Hindi or English for the rest.
Language = Literal[
    "en-IN",
    "hi-IN",
    "kn-IN",
    "ta-IN",
    "te-IN",
    "ml-IN",
    "mr-IN",
    "bn-IN",
    "gu-IN",
    "pa-IN",
    "od-IN",
]
CONSENT_VERSION = "2026-11"  # bump when the wording the person agreed to changes
E164 = re.compile(r"^\+[1-9][0-9]{7,14}$")


class CallbackCreate(InputModel):
    phone: str = Field(description="E.164, for example +919876543210")
    language: Language
    topic: Topic
    note: str | None = Field(default=None, max_length=300)
    # An explicit yes. ``False`` or a missing value is refused, not treated as "no preference".
    consent: Literal[True]

    @field_validator("phone", mode="before")
    @classmethod
    def clean_phone(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        cleaned = re.sub(r"[\s().-]", "", value)  # spaces and dashes people type are harmless
        if not E164.match(cleaned):
            raise ValueError("Enter the number with its country code, like +919876543210")
        return cleaned

    @field_validator("note")
    @classmethod
    def clean_note(cls, value: str | None) -> str | None:
        cleaned = " ".join(value.split()) if value else ""
        return cleaned or None


class CallbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: Literal["sent", "do_not_call"]
    created_at: datetime
