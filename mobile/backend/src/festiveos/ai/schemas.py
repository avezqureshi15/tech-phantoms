import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from festiveos.ai.cards import Card
from festiveos.core.schemas import InputModel

MAX_MESSAGE_CHARS = 2_000
MAX_DOCUMENTS = 3
MAX_DOCUMENT_CHARS = 20_000
MAX_ATTACHED_CHARS = 40_000


class AttachedDocument(InputModel):
    """A document the person attached, already read into text by ``POST .../ai/documents``."""

    name: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=MAX_DOCUMENT_CHARS)


class MessageCreate(InputModel):
    message: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    # "elder": a spoken, one-thing-at-a-time conversation for elders. "recite": practising a
    # prayer by repeating it, with corrections. A chat stays in the mode it started in.
    mode: Literal["normal", "elder", "recite"] = "normal"
    documents: list[AttachedDocument] = Field(default_factory=list, max_length=MAX_DOCUMENTS)
    # The language speech recognition heard (for example "kn-IN"), so a reply matches it even when
    # the words are written in Roman letters. Unknown codes are ignored.
    language: str | None = Field(default=None, pattern=r"^[a-z]{2,3}-[A-Z]{2}$", max_length=10)

    @model_validator(mode="after")
    def within_budget(self) -> "MessageCreate":
        if sum(len(d.text) for d in self.documents) > MAX_ATTACHED_CHARS:
            raise ValueError("The attached documents are too long together")
        return self


class DocumentRead(BaseModel):
    name: str
    text: str
    truncated: bool


class CardResponse(InputModel):
    """A person's reply to a card: ``answers`` for a question, ``decision`` for a confirmation."""

    answers: dict[str, Any] | None = None
    decision: Literal["approve", "decline"] | None = None

    @model_validator(mode="after")
    def exactly_one(self) -> "CardResponse":
        if (self.answers is None) == (self.decision is None):
            raise ValueError("send either answers or decision")
        return self


class SkillRead(BaseModel):
    command: str
    title: str
    description: str
    example: str


class TextItem(BaseModel):
    type: Literal["text"] = "text"
    text: str


class CardItem(BaseModel):
    type: Literal["card"] = "card"
    card: Card


Item = Annotated[TextItem | CardItem, Field(discriminator="type")]


class TurnRead(BaseModel):
    conversation_id: uuid.UUID
    agent: str
    items: list[Item]
    pending_card: Card | None


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    household_id: uuid.UUID
    title: str
    active_agent: str
    created_at: datetime
    updated_at: datetime


class MessageRead(BaseModel):
    role: Literal["user", "assistant", "notice"]
    items: list[Item]
    created_at: datetime


class ConversationDetail(ConversationRead):
    messages: list[MessageRead]
    pending_card: Card | None


class TranscriptRead(BaseModel):
    text: str
    language: str | None


class SpeakRequest(InputModel):
    text: str = Field(min_length=1, max_length=6_000)
    # Normally left out: the language is read from the text itself.
    language: str | None = Field(default=None, max_length=10)
    pace: float = Field(default=1.0, ge=0.5, le=1.5)
