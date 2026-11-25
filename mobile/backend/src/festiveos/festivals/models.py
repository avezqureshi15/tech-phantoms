import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Text,
    Time,
    func,
    orm,
)
from sqlalchemy.orm import Mapped, mapped_column

from festiveos.db.base import Base


class Festival(Base):
    __tablename__ = "festivals"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(Text)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(16), default="planning")
    readiness_score: Mapped[int] = mapped_column(SmallInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    events: Mapped[list["FestivalEvent"]] = orm.relationship(
        lazy="raise",
        order_by=lambda: (FestivalEvent.event_date, FestivalEvent.start_time),
    )


class FestivalEvent(Base):
    __tablename__ = "festival_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    festival_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("festivals.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(Text)
    event_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[time | None] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time)
    location: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
