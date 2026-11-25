import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from festiveos.expenses.kinds import UserKey
from festiveos.expenses.models import Expense, ExpenseShare, Settlement


class ExpenseRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    # expenses
    def get(self, expense_id: uuid.UUID) -> Expense | None:
        stmt = select(Expense).where(Expense.id == expense_id).options(selectinload(Expense.shares))
        return self._session.scalar(stmt)

    def list_for_household(
        self, household_id: uuid.UUID, festival_id: uuid.UUID | None, limit: int, offset: int
    ) -> list[Expense]:
        stmt = select(Expense).where(Expense.household_id == household_id)
        if festival_id is not None:
            stmt = stmt.where(Expense.festival_id == festival_id)
        stmt = (
            stmt.options(selectinload(Expense.shares))  # two queries however many expenses
            .order_by(Expense.spent_on.desc(), Expense.created_at.desc(), Expense.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.scalars(stmt))

    def add(self, expense: Expense) -> Expense:
        self._session.add(expense)
        self._session.flush()
        return expense

    def delete(self, expense: Expense) -> None:
        self._session.delete(expense)
        self._session.flush()

    # aggregates, each one query
    def _scope(self, stmt, household_id: uuid.UUID, festival_id: uuid.UUID | None):
        stmt = stmt.where(Expense.household_id == household_id)
        return stmt if festival_id is None else stmt.where(Expense.festival_id == festival_id)

    def paid_totals(
        self, household_id: uuid.UUID, festival_id: uuid.UUID | None
    ) -> dict[UserKey, int]:
        stmt = self._scope(
            select(Expense.paid_by, func.sum(Expense.amount_minor)), household_id, festival_id
        ).group_by(Expense.paid_by)
        return {user: int(total) for user, total in self._session.execute(stmt)}

    def owed_totals(
        self, household_id: uuid.UUID, festival_id: uuid.UUID | None
    ) -> dict[UserKey, int]:
        stmt = self._scope(
            select(ExpenseShare.user_id, func.sum(ExpenseShare.amount_minor)).join(
                Expense, Expense.id == ExpenseShare.expense_id
            ),
            household_id,
            festival_id,
        ).group_by(ExpenseShare.user_id)
        return {user: int(total) for user, total in self._session.execute(stmt)}

    def category_totals(
        self, household_id: uuid.UUID, festival_id: uuid.UUID | None
    ) -> tuple[dict[str, int], int]:
        stmt = self._scope(
            select(Expense.category, func.sum(Expense.amount_minor), func.count()),
            household_id,
            festival_id,
        ).group_by(Expense.category)
        rows = list(self._session.execute(stmt))
        return {c: int(total) for c, total, _ in rows}, sum(count for _, _, count in rows)

    # settlements
    def settlement_totals(
        self, household_id: uuid.UUID
    ) -> tuple[dict[UserKey, int], dict[UserKey, int]]:
        def totals(column) -> dict[UserKey, int]:
            stmt = (
                select(column, func.sum(Settlement.amount_minor))
                .where(Settlement.household_id == household_id)
                .group_by(column)
            )
            return {user: int(total) for user, total in self._session.execute(stmt)}

        return totals(Settlement.payer), totals(Settlement.payee)

    def add_settlement(self, settlement: Settlement) -> Settlement:
        self._session.add(settlement)
        self._session.flush()
        return settlement

    def get_settlement(self, settlement_id: uuid.UUID) -> Settlement | None:
        return self._session.get(Settlement, settlement_id)

    def list_settlements(
        self, household_id: uuid.UUID, limit: int, offset: int
    ) -> list[Settlement]:
        stmt = (
            select(Settlement)
            .where(Settlement.household_id == household_id)
            .order_by(Settlement.settled_on.desc(), Settlement.created_at.desc(), Settlement.id)
            .limit(limit)
            .offset(offset)
        )
        return list(self._session.scalars(stmt))

    def delete_settlement(self, settlement: Settlement) -> None:
        self._session.delete(settlement)
        self._session.flush()
