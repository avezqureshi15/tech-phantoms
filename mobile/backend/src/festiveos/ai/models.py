import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from festiveos.db.base import Base


class AIConversation(Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (Index("ix_ai_conversations_user_household", "user_id", "household_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    active_agent: Mapped[str] = mapped_column(String(24), default="sutradhar")
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    # Set while a turn runs, so two requests cannot drive one conversation at once without holding
    # a database lock through a slow model call. A stale value (crashed worker) is ignored.
    turn_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AIMessage(Base):
    """One entry of the transcript.

    ``content`` is the API message body exactly as it was sent or received. It is a plain JSON
    column, not JSONB: JSONB reorders keys, and replaying different bytes would break the prompt
    cache (and, for thinking blocks, the model's history check).
    """

    __tablename__ = "ai_messages"
    __table_args__ = (UniqueConstraint("conversation_id", "seq", name="uq_ai_messages_seq"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE")
    )
    seq: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String(16))  # user | assistant | system | notice
    content: Mapped[Any] = mapped_column(JSON)
    ui: Mapped[Any | None] = mapped_column(JSON)  # what to render: text and cards
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AIPendingCard(Base):
    """A card waiting for a person. At most one is open per conversation (enforced by index)."""

    __tablename__ = "ai_pending_cards"
    __table_args__ = (
        Index(
            "uq_ai_pending_cards_one_open",
            "conversation_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
            sqlite_where=text("status = 'open'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)  # the card's own id
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_conversations.id", ondelete="CASCADE")
    )
    tool_use_id: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(16))  # question | confirm
    card: Mapped[Any] = mapped_column(JSON)
    payload: Mapped[Any] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(
        String(12), default="open"
    )  # open|answered|approved|declined
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
