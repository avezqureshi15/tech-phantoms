import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from festiveos.core.errors import ConflictError, ForbiddenError, InvalidInputError, NotFoundError
from festiveos.core.log import logged_service
from festiveos.festivals.repository import FestivalRepository
from festiveos.households.access import HouseholdAccess
from festiveos.households.repository import HouseholdRepository
from festiveos.traditions.models import Tradition, TraditionOccurrence
from festiveos.traditions.repository import TraditionRepository
from festiveos.traditions.schemas import (
    ChecklistItem,
    OccurrenceCreate,
    TraditionCreate,
    TraditionRead,
    TraditionUpdate,
)
from festiveos.users.models import User
from festiveos.users.repository import UserRepository
from festiveos.users.schemas import UserSummary


@logged_service
class TraditionService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._traditions = TraditionRepository(session)
        self._festivals = FestivalRepository(session)
        self._users = UserRepository(session)
        self._households = HouseholdRepository(session)
        self._access = HouseholdAccess(self._households)

    def create(self, actor: User, household_id: uuid.UUID, data: TraditionCreate) -> Tradition:
        self._access.member(household_id, actor.id)
        household = self._households.get(household_id)
        if household is None or household.kind != "household":
            raise InvalidInputError("Traditions are only for household groups")
        tradition = self._traditions.add(
            Tradition(household_id=household_id, created_by=actor.id, **data.model_dump())
        )
        self._session.commit()
        return tradition

    def list_for_household(
        self,
        actor: User,
        household_id: uuid.UUID,
        festival_type: str | None,
        active: bool | None,
        limit: int,
        offset: int,
    ) -> list[Tradition]:
        self._access.member(household_id, actor.id)
        return self._traditions.list_for_household(
            household_id, festival_type, active, limit, offset
        )

    def get_detail(self, actor: User, tradition_id: uuid.UUID) -> Tradition:
        tradition = self._traditions.get_with_history(tradition_id)
        if tradition is None:
            raise NotFoundError("Tradition not found")
        self._access.member(tradition.household_id, actor.id)
        return tradition

    def checklist(self, actor: User, festival_id: uuid.UUID) -> list[ChecklistItem]:
        festival = self._festivals.get(festival_id)
        if festival is None:
            raise NotFoundError("Festival not found")
        self._access.member(festival.household_id, actor.id)

        return [
            ChecklistItem(
                tradition=TraditionRead.model_validate(tradition),
                occurrence_id=occurrence.id if occurrence else None,
                completed=occurrence is not None and occurrence.completed_at is not None,
                completed_at=occurrence.completed_at if occurrence else None,
                performed_by=UserSummary.model_validate(performer) if performer else None,
            )
            for tradition, occurrence, performer in self._traditions.checklist(festival)
        ]

    def update(self, actor: User, tradition_id: uuid.UUID, data: TraditionUpdate) -> Tradition:
        tradition = self._traditions.get(tradition_id)
        if tradition is None:
            raise NotFoundError("Tradition not found")
        member = self._access.member(tradition.household_id, actor.id)
        if tradition.created_by != actor.id and member.role != "admin":
            raise ForbiddenError("Only the creator or an admin can edit this tradition")

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(tradition, field, value)
        self._session.commit()
        return tradition

    def record_occurrence(
        self, actor: User, tradition_id: uuid.UUID, data: OccurrenceCreate
    ) -> TraditionOccurrence:
        tradition = self._traditions.get(tradition_id)
        if tradition is None:
            raise NotFoundError("Tradition not found")
        self._access.member(tradition.household_id, actor.id)
        if self._households.lock_for_children(tradition.household_id) is None:
            raise NotFoundError("Tradition not found")

        festival = self._festivals.get(data.festival_id)
        if festival is None or festival.household_id != tradition.household_id:
            raise NotFoundError("Festival not found")
        if festival.type != tradition.festival_type:
            raise InvalidInputError("This tradition belongs to a different festival")

        performer = None
        if data.performed_by is not None:
            if self._households.get_member(tradition.household_id, data.performed_by) is None:
                raise InvalidInputError("performed_by must be a household member")
            performer = self._users.get(data.performed_by)

        try:
            occurrence = self._traditions.add_occurrence(
                TraditionOccurrence(
                    tradition_id=tradition.id,
                    festival=festival,
                    performer=performer,
                    completed_at=data.completed_at or datetime.now(UTC),
                    notes=data.notes,
                    photo_url=str(data.photo_url) if data.photo_url else None,
                )
            )
            self._session.commit()
        except IntegrityError as exc:
            self._session.rollback()
            raise ConflictError("Already recorded for this festival") from exc
        return occurrence
