import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text, func, orm
from sqlalchemy.orm import Mapped, mapped_column

from festiveos.db.base import Base
from festiveos.users.models import User


class Household(Base):
    __tablename__ = "households"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Kolkata")
    location: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    default_language: Mapped[str] = mapped_column(String(8), default="en")
    # The faiths this group follows (values of core.faiths.Faith). Empty means "show everything".
    # household | friends | office | other. Only households keep traditions.
    kind: Mapped[str] = mapped_column(String(16), default="household")
    # "emoji:<emoji>" or "symbol:<ionicons name>"; None means the kind's default icon.
    icon: Mapped[str | None] = mapped_column(String(40))
    color: Mapped[str | None] = mapped_column(String(7))  # "#RRGGBB"
    faiths: Mapped[list[str]] = mapped_column(JSON, default=list)
    # Where the panchang is computed: a key from the panchang city list. Sunrise decides the day.
    panchang_city: Mapped[str] = mapped_column(String(32), default="delhi")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # lazy="raise": a forgotten eager load fails loudly instead of silently
    # issuing one query per row (N+1).
    members: Mapped[list["HouseholdMember"]] = orm.relationship(
        lazy="raise",
        order_by="HouseholdMember.joined_at",
    )


class HouseholdMember(Base):
    __tablename__ = "household_members"

    household_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("households.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    relationship: Mapped[str | None] = mapped_column(String(32))
    role: Mapped[str] = mapped_column(String(16), default="member")
    notification_preference: Mapped[str] = mapped_column(String(16), default="all")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = orm.relationship(lazy="raise")
