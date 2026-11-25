import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from festiveos.db.base import Base
from festiveos.users.models import User  # noqa: F401  (registers the users table for the foreign key)


class SupportCallback(Base):
    """A record that a person asked for a call back, and when they consented.

    Deliberately NOT stored here: their phone number and what they wrote. Those go to the support
    platform to make the call and are not kept by this app, so there is nothing to leak or to purge.
    """

    __tablename__ = "support_callbacks"
    __table_args__ = (Index("ix_support_callbacks_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    topic: Mapped[str] = mapped_column(String(32))
    language: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(16))  # sent | do_not_call
    remote_id: Mapped[str | None] = mapped_column(
        String(64)
    )  # the query's id on the support platform
    consent_text_version: Mapped[str] = mapped_column(String(16))
    consented_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
