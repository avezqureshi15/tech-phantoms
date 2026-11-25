import uuid

from sqlalchemy.orm import Session

from festiveos.core.errors import InvalidInputError, NotFoundError
from festiveos.core.log import logged_service
from festiveos.festivals.models import Festival, FestivalEvent
from festiveos.festivals.repository import FestivalRepository
from festiveos.festivals.schemas import EventCreate, FestivalCreate, FestivalUpdate
from festiveos.households.access import HouseholdAccess
from festiveos.households.repository import HouseholdRepository
from festiveos.users.models import User


@logged_service
class FestivalService:
    def __init__(self, session: Session) -> None:
        self._session = session
        self._festivals = FestivalRepository(session)
        self._access = HouseholdAccess(HouseholdRepository(session))

    def create(self, actor: User, household_id: uuid.UUID, data: FestivalCreate) -> Festival:
        self._access.admin(household_id, actor.id)
        festival = self._festivals.add(Festival(household_id=household_id, **data.model_dump()))
        self._session.commit()
        return festival

    def list_for_household(
        self,
        actor: User,
        household_id: uuid.UUID,
        status: str | None,
        limit: int,
        offset: int,
    ) -> list[Festival]:
        self._access.member(household_id, actor.id)
        return self._festivals.list_for_household(household_id, status, limit, offset)

    def get_detail(self, actor: User, festival_id: uuid.UUID) -> Festival:
        festival = self._festivals.get_with_events(festival_id)
        if festival is None:
            raise NotFoundError("Festival not found")
        self._access.member(festival.household_id, actor.id)
        return festival

    def update(self, actor: User, festival_id: uuid.UUID, data: FestivalUpdate) -> Festival:
        festival = self._get_for_admin(actor, festival_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(festival, field, value)
        if festival.end_date < festival.start_date:
            self._session.rollback()
            raise InvalidInputError("end_date must not be before start_date")
        self._session.commit()
        return festival

    def add_event(self, actor: User, festival_id: uuid.UUID, data: EventCreate) -> FestivalEvent:
        festival = self._get_for_admin(actor, festival_id)
        if not festival.start_date <= data.event_date <= festival.end_date:
            raise InvalidInputError("event_date must fall within the festival dates")
        event = self._festivals.add_event(
            FestivalEvent(festival_id=festival.id, **data.model_dump())
        )
        self._session.commit()
        return event

    def _get_for_admin(self, actor: User, festival_id: uuid.UUID) -> Festival:
        festival = self._festivals.get(festival_id)
        if festival is None:
            raise NotFoundError("Festival not found")
        self._access.admin(festival.household_id, actor.id)
        return festival
