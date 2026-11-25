import uuid
from collections.abc import Sequence

from sqlalchemy import String, cast, func, select
from sqlalchemy.orm import Session

from festiveos.expenses.models import Expense
from festiveos.festivals.models import Festival
from festiveos.households.models import Household, HouseholdMember
from festiveos.traditions.models import Tradition
from festiveos.users.models import User


def like_pattern(query: str) -> str:
    """A contains-match pattern with the user's own % and _ treated as plain characters."""
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


class SearchRepository:
    """Every query is restricted to the groups the searcher belongs to. One query per kind."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def groups(self, ids: Sequence[uuid.UUID], pattern: str, limit: int) -> list[Household]:
        stmt = (
            select(Household)
            .where(Household.id.in_(ids), Household.name.ilike(pattern, escape="\\"))
            .order_by(Household.name, Household.id)
            .limit(limit)
        )
        return list(self._session.scalars(stmt))

    def festivals(self, ids: Sequence[uuid.UUID], pattern: str, limit: int) -> list[Festival]:
        stmt = (
            select(Festival)
            .where(Festival.household_id.in_(ids), Festival.name.ilike(pattern, escape="\\"))
            .order_by(Festival.start_date.desc(), Festival.id)
            .limit(limit)
        )
        return list(self._session.scalars(stmt))

    def traditions(self, ids: Sequence[uuid.UUID], pattern: str, limit: int) -> list[Tradition]:
        stmt = (
            select(Tradition)
            .where(Tradition.household_id.in_(ids), Tradition.name.ilike(pattern, escape="\\"))
            .order_by(Tradition.name, Tradition.id)
            .limit(limit)
        )
        return list(self._session.scalars(stmt))

    def expenses(self, ids: Sequence[uuid.UUID], pattern: str, limit: int) -> list[Expense]:
        stmt = (
            select(Expense)
            .where(Expense.household_id.in_(ids), Expense.description.ilike(pattern, escape="\\"))
            .order_by(Expense.spent_on.desc(), Expense.id)
            .limit(limit)
        )
        return list(self._session.scalars(stmt))

    def members(
        self, ids: Sequence[uuid.UUID], pattern: str, limit: int
    ) -> list[tuple[User, uuid.UUID]]:
        """People who share a group with the searcher, each with one group they share."""
        stmt = (
            # min() has no uuid form on Postgres, so take the minimum of the text form.
            select(User, func.min(cast(HouseholdMember.household_id, String)))
            .join(HouseholdMember, HouseholdMember.user_id == User.id)
            .where(HouseholdMember.household_id.in_(ids), User.name.ilike(pattern, escape="\\"))
            .group_by(User.id)
            .order_by(User.name, User.id)
            .limit(limit)
        )
        return [
            (user, uuid.UUID(household_id)) for user, household_id in self._session.execute(stmt)
        ]
