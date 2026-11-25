"""Cards: the structured things Utsav shows a person instead of free text.

* ``QuestionCard``: the model asks for missing facts. The model supplies only the content; the
  server assigns the id and validates every answer against the card, so a hallucinated option or
  an out-of-range number is rejected no matter what the client sends.
* ``ConfirmCard``: a write the model wants to make. Built by the server from a validated
  proposal; nothing is written until the person approves it.
* ``HostingPlanCard``: the result of the hosting calculator. Built by the server from the
  calculator output, never from model text, so the numbers on screen are the computed ones.
"""

import uuid
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from festiveos.core.errors import InvalidInputError

KEY_PATTERN = r"^[a-z][a-z0-9_]{0,31}$"
MAX_FIELDS = 6
MAX_OPTIONS = 8
FieldType = Literal["single_choice", "multi_choice", "number", "text", "yes_no"]
MAX_TEXT_LENGTH = 300


class Option(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=60)


class QuestionField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(pattern=KEY_PATTERN)
    label: str = Field(min_length=1, max_length=120)
    type: FieldType
    options: list[Option] = Field(default_factory=list, max_length=MAX_OPTIONS)
    minimum: float | None = None
    maximum: float | None = None
    unit: str | None = Field(default=None, max_length=20)
    required: bool = True

    @model_validator(mode="after")
    def consistent(self) -> "QuestionField":
        is_choice = self.type in ("single_choice", "multi_choice")
        if is_choice and len(self.options) < 2:
            raise ValueError(f"{self.key}: a choice field needs at least two options")
        if not is_choice and self.options:
            raise ValueError(f"{self.key}: only choice fields take options")
        if is_choice and len({o.value for o in self.options}) != len(self.options):
            raise ValueError(f"{self.key}: option values must be unique")
        if self.type == "number" and (self.minimum is None or self.maximum is None):
            raise ValueError(f"{self.key}: a number field needs minimum and maximum")
        if None not in (self.minimum, self.maximum) and self.minimum > self.maximum:  # type: ignore[operator]
            raise ValueError(f"{self.key}: minimum is above maximum")
        return self


class QuestionContent(BaseModel):
    """What the model is allowed to author."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=400)
    fields: list[QuestionField] = Field(min_length=1, max_length=MAX_FIELDS)

    @model_validator(mode="after")
    def unique_keys(self) -> "QuestionContent":
        keys = [f.key for f in self.fields]
        if len(set(keys)) != len(keys):
            raise ValueError("field keys must be unique")
        return self


class QuestionCard(QuestionContent):
    kind: Literal["question"] = "question"
    id: uuid.UUID


class Detail(BaseModel):
    label: str
    value: str


class ConfirmCard(BaseModel):
    kind: Literal["confirm"] = "confirm"
    id: uuid.UUID
    title: str
    summary: str
    details: list[Detail]


class PlanSection(BaseModel):
    heading: str
    lines: list[Detail]


class HostingPlanCard(BaseModel):
    kind: Literal["hosting_plan"] = "hosting_plan"
    id: uuid.UUID
    title: str
    headline: str
    sections: list[PlanSection]


class LinkItem(BaseModel):
    label: str = Field(max_length=120)
    url: str = Field(max_length=500)
    note: str | None = Field(default=None, max_length=200)


class LinksCard(BaseModel):
    """Pages the person can open (event listings to RSVP on, for example). Built by the server from
    checked addresses, never from model text."""

    kind: Literal["links"] = "links"
    id: uuid.UUID
    title: str
    description: str | None = None
    links: list[LinkItem]


class CalendarCard(BaseModel):
    """An event for the person's own phone calendar. Nothing is added until they tap it."""

    kind: Literal["calendar_event"] = "calendar_event"
    id: uuid.UUID
    title: str = Field(max_length=120)
    start_date: date
    end_date: date
    notes: str | None = Field(default=None, max_length=300)


# The screens Utsav may point a person to. A closed list: the app maps each name to a real screen,
# and nothing the model writes can open anything else.
SCREENS = (
    "home",
    "festivals",
    "expenses",
    "add_expense",
    "today",
    "traditions",
    "family",
    "profile",
    "appearance",
    "support",
)


class NavigationCard(BaseModel):
    """A button that opens a screen of the app. Nothing happens until the person taps it."""

    kind: Literal["navigate"] = "navigate"
    id: uuid.UUID
    title: str = Field(max_length=60)
    screen: str

    @field_validator("screen")
    @classmethod
    def known_screen(cls, value: str) -> str:
        if value not in SCREENS:
            raise ValueError(f"unknown screen: {value}")
        return value


Card = Annotated[
    QuestionCard | ConfirmCard | HostingPlanCard | LinksCard | CalendarCard | NavigationCard,
    Field(discriminator="kind"),
]


def validate_answers(card: QuestionCard, answers: dict[str, object]) -> dict[str, object]:
    """Check a person's answers against the card that asked. Returns the cleaned answers."""
    known = {f.key: f for f in card.fields}
    unknown = sorted(set(answers) - set(known))
    if unknown:
        raise InvalidInputError(f"Unexpected answers: {', '.join(unknown)}")

    cleaned: dict[str, object] = {}
    for key, field in known.items():
        value = answers.get(key)
        if value is None or value == "" or value == []:
            if field.required:
                raise InvalidInputError(f"'{field.label}' is required")
            continue
        cleaned[key] = _clean(field, value)
    return cleaned


def _clean(field: QuestionField, value: object) -> object:
    allowed = {o.value for o in field.options}
    if field.type == "single_choice":
        if value not in allowed:
            raise InvalidInputError(f"'{field.label}': choose one of the offered options")
        return value
    if field.type == "multi_choice":
        if not isinstance(value, list) or not value or not set(value) <= allowed:
            raise InvalidInputError(f"'{field.label}': choose from the offered options")
        if len(set(value)) != len(value):
            raise InvalidInputError(f"'{field.label}': an option was chosen twice")
        return value
    if field.type == "yes_no":
        if not isinstance(value, bool):
            raise InvalidInputError(f"'{field.label}': answer yes or no")
        return value
    if field.type == "number":
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise InvalidInputError(f"'{field.label}': enter a number")
        if not field.minimum <= value <= field.maximum:  # type: ignore[operator]
            raise InvalidInputError(
                f"'{field.label}': enter a value from {field.minimum:g} to {field.maximum:g}"
            )
        return value
    if not isinstance(value, str) or len(value) > MAX_TEXT_LENGTH:
        raise InvalidInputError(f"'{field.label}': enter up to {MAX_TEXT_LENGTH} characters")
    return value.strip()
