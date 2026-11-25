import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from festiveos.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text)
    email: Mapped[str] = mapped_column(Text, unique=True)
    phone: Mapped[str | None] = mapped_column(String(16))
    avatar_url: Mapped[str | None] = mapped_column(String)
    # Faiths this person follows (values of core.faiths.Faith); shapes what their Today page shows.
    faiths: Mapped[list[str]] = mapped_column(JSON, default=list)
    # None until they have answered, even if the answer was "prefer not to say" (an empty list).
    faith_chosen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    home_city: Mapped[str | None] = mapped_column(String(32))  # a panchang city key
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
