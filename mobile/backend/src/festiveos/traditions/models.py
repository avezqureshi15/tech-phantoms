import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    orm,
)
from sqlalchemy.orm import Mapped, mapped_column

from festiveos.db.base import Base
from festiveos.festivals.models import Festival
from festiveos.users.models import User


class Tradition(Base):
    __tablename__ = "traditions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"))
    festival_type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(16))
    scope: Mapped[str] = mapped_column(String(16), default="family")
    description: Mapped[str | None] = mapped_column(Text)
    origin: Mapped[str | None] = mapped_column(Text)
    significance: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(String(64))
    started_year: Mapped[int | None] = mapped_column(SmallInteger)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    occurrences: Mapped[list["TraditionOccurrence"]] = orm.relationship(
        lazy="raise",
        order_by=lambda: TraditionOccurrence.created_at.desc(),
    )


class TraditionOccurrence(Base):
    __tablename__ = "tradition_occurrences"
    __table_args__ = (
        UniqueConstraint(
            "tradition_id",
            "festival_id",
            name="uq_tradition_occurrences_tradition_id_festival_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tradition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("traditions.id", ondelete="CASCADE"))
    festival_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("festivals.id", ondelete="CASCADE"))
    performed_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
    photo_url: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    festival: Mapped[Festival] = orm.relationship(lazy="raise")
    performer: Mapped[User | None] = orm.relationship(lazy="raise")

    @property
    def festival_name(self) -> str:
        return self.festival.name

    @property
    def year(self) -> int:
        return self.festival.start_date.year
