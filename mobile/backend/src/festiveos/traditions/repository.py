import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from festiveos.festivals.models import Festival
from festiveos.traditions.models import Tradition, TraditionOccurrence
from festiveos.users.models import User


class TraditionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get(self, tradition_id: uuid.UUID) -> Tradition | None:
        return self._session.get(Tradition, tradition_id)

    def get_with_history(self, tradition_id: uuid.UUID) -> Tradition | None:
        # Four queries total (tradition, occurrences, festivals, performers).
        stmt = (
            select(Tradition)
            .where(Tradition.id == tradition_id)
            .options(
                selectinload(Tradition.occurrences).selectinload(TraditionOccurrence.festival),
                selectinload(Tradition.occurrences).selectinload(TraditionOccurrence.performer),
            )
        )
        return self._session.scalar(stmt)

    def list_for_household(
        self,
        household_id: uuid.UUID,
        festival_type: str | None,
        active: bool | None,
        limit: int,
        offset: int,
    ) -> list[Tradition]:
        stmt = select(Tradition).where(Tradition.household_id == household_id)
        if festival_type is not None:
            stmt = stmt.where(Tradition.festival_type == festival_type)
        if active is not None:
            stmt = stmt.where(Tradition.active.is_(active))
        stmt = stmt.order_by(Tradition.name, Tradition.id).limit(limit).offset(offset)
        return list(self._session.scalars(stmt))

    def checklist(
        self, festival: Festival
    ) -> list[tuple[Tradition, TraditionOccurrence | None, User | None]]:
        # One query: every active tradition of this festival type, with this
        # festival's occurrence and performer when they exist.
        stmt = (
            select(Tradition, TraditionOccurrence, User)
            .outerjoin(
                TraditionOccurrence,
                (TraditionOccurrence.tradition_id == Tradition.id)
                & (TraditionOccurrence.festival_id == festival.id),
            )
            .outerjoin(User, User.id == TraditionOccurrence.performed_by)
            .where(
                Tradition.household_id == festival.household_id,
                Tradition.festival_type == festival.type,
                Tradition.active.is_(True),
            )
            .order_by(Tradition.name, Tradition.id)
        )
        return [tuple(row) for row in self._session.execute(stmt)]

    def add(self, tradition: Tradition) -> Tradition:
        self._session.add(tradition)
        self._session.flush()
        return tradition

    def add_occurrence(self, occurrence: TraditionOccurrence) -> TraditionOccurrence:
        self._session.add(occurrence)
        self._session.flush()
        return occurrence
