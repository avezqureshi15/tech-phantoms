import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from festiveos.households.models import Household, HouseholdMember


class HouseholdRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def list_for_user(self, user_id: uuid.UUID) -> list[Household]:
        stmt = (
            select(Household)
            .join(HouseholdMember, HouseholdMember.household_id == Household.id)
            .where(HouseholdMember.user_id == user_id)
            .order_by(Household.created_at)
        )
        return list(self._session.scalars(stmt))

    def get_with_members(self, household_id: uuid.UUID) -> Household | None:
        # Three queries total (household, members, users) however many members.
        stmt = (
            select(Household)
            .where(Household.id == household_id)
            .options(selectinload(Household.members).selectinload(HouseholdMember.user))
        )
        return self._session.scalar(stmt)

    def get_member(self, household_id: uuid.UUID, user_id: uuid.UUID) -> HouseholdMember | None:
        return self._session.get(HouseholdMember, (household_id, user_id))

    def get(self, household_id: uuid.UUID) -> Household | None:
        return self._session.get(Household, household_id)

    def member_household_ids(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        """Sorted, so everything that locks several households does so in one global order."""
        return list(
            self._session.scalars(
                select(HouseholdMember.household_id)
                .where(HouseholdMember.user_id == user_id)
                .order_by(HouseholdMember.household_id)
            )
        )

    def list_member_ids(self, household_id: uuid.UUID) -> set[uuid.UUID]:
        """Everyone in a group in one query, so checking many people is one lookup, not many."""
        return set(
            self._session.scalars(
                select(HouseholdMember.user_id).where(HouseholdMember.household_id == household_id)
            )
        )

    def lock(self, household_id: uuid.UUID) -> None:
        """Serialise membership changes: concurrent admins queue up on this row."""
        self._session.execute(
            select(Household.id).where(Household.id == household_id).with_for_update()
        )

    def lock_for_children(self, household_id: uuid.UUID) -> uuid.UUID | None:
        """FOR KEY SHARE: writers that create things inside a household queue behind a delete.

        Deleting a household cascades through festivals and traditions in an order of Postgres'
        choosing, so anything that locks several of those rows must first go through the
        household row, which every deleter already locks.
        """
        return self._session.scalar(
            select(Household.id)
            .where(Household.id == household_id)
            .with_for_update(read=True, key_share=True)
        )

    def get_member_for_update(
        self, household_id: uuid.UUID, user_id: uuid.UUID
    ) -> HouseholdMember | None:
        # populate_existing re-reads the row so decisions never use a stale role.
        stmt = (
            select(HouseholdMember)
            .where(
                HouseholdMember.household_id == household_id,
                HouseholdMember.user_id == user_id,
            )
            .options(selectinload(HouseholdMember.user))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return self._session.scalar(stmt)

    def count_admins(self, household_id: uuid.UUID) -> int:
        return (
            self._session.scalar(
                select(func.count())
                .select_from(HouseholdMember)
                .where(
                    HouseholdMember.household_id == household_id,
                    HouseholdMember.role == "admin",
                )
            )
            or 0
        )

    def count_members(self, household_id: uuid.UUID) -> int:
        return (
            self._session.scalar(
                select(func.count())
                .select_from(HouseholdMember)
                .where(HouseholdMember.household_id == household_id)
            )
            or 0
        )

    def delete(self, household_id: uuid.UUID) -> None:
        # The database cascades to members, festivals, events, traditions and history.
        self._session.execute(
            delete(Household)
            .where(Household.id == household_id)
            .execution_options(synchronize_session=False)
        )

    def delete_member(self, member: HouseholdMember) -> None:
        self._session.delete(member)
        self._session.flush()

    def add(self, household: Household) -> Household:
        self._session.add(household)
        self._session.flush()
        return household

    def add_member(self, member: HouseholdMember) -> HouseholdMember:
        self._session.add(member)
        self._session.flush()
        return member
