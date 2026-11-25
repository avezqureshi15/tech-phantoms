import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from festiveos.festivals.models import Festival, FestivalEvent


class FestivalRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, festival_id: uuid.UUID) -> Festival | None:
        return self._session.get(Festival, festival_id)

    def get_with_events(self, festival_id: uuid.UUID) -> Festival | None:
        stmt = (
            select(Festival)
            .where(Festival.id == festival_id)
            .options(selectinload(Festival.events))
        )
        return self._session.scalar(stmt)

    def list_for_household(
        self, household_id: uuid.UUID, status: str | None, limit: int, offset: int
    ) -> list[Festival]:
        stmt = select(Festival).where(Festival.household_id == household_id)
        if status is not None:
            stmt = stmt.where(Festival.status == status)
        stmt = stmt.order_by(Festival.start_date.desc(), Festival.id).limit(limit).offset(offset)
        return list(self._session.scalars(stmt))

    def add(self, festival: Festival) -> Festival:
        self._session.add(festival)
        self._session.flush()
        return festival

    def add_event(self, event: FestivalEvent) -> FestivalEvent:
        self._session.add(event)
        self._session.flush()
        return event
