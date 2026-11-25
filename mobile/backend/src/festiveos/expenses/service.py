import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from festiveos.config import get_settings
from festiveos.core.errors import InvalidInputError, NotFoundError, ServiceUnavailableError
from festiveos.core.log import logged_service
from festiveos.core.uploads import checked_document
from festiveos.expenses import balances
from festiveos.expenses.models import Expense, ExpenseShare, Settlement
from festiveos.expenses.receipts import RECEIPT_SCHEMA, to_draft
from festiveos.expenses.repository import ExpenseRepository
from festiveos.expenses.schemas import (
    BalancesRead,
    ExpenseCreate,
    ExpenseRead,
    ExpenseUpdate,
    MemberBalance,
    ReceiptDraft,
    SettlementCreate,
    SettlementRead,
    SplitInput,
    SummaryRead,
    TransferRead,
)
from festiveos.expenses.splits import SplitError, split
from festiveos.festivals.repository import FestivalRepository
from festiveos.households.access import HouseholdAccess
from festiveos.households.models import Household
from festiveos.households.repository import HouseholdRepository
from festiveos.integrations.sarvam import SarvamClient
from festiveos.users.models import User


@logged_service
class ExpenseService:
    """Splitwise-style shared expenses. Any member can add an expense or record a payment;
    only the person who added something, or a group admin, can change or remove it."""

    def __init__(self, session: Session) -> None:
        self._session = session
        self._expenses = ExpenseRepository(session)
        self._households = HouseholdRepository(session)
        self._festivals = FestivalRepository(session)
        self._access = HouseholdAccess(self._households)

    # ----------------------------------------------------------------------------- expenses

    def scan_receipt(
        self,
        actor: User,
        household_id: uuid.UUID,
        data: bytes,
        filename: str,
        reader: SarvamClient | None,
    ) -> ReceiptDraft:
        """Read a receipt photo or PDF into a draft expense. Nothing is stored: the file lives in
        memory for the length of the call, and the person confirms the draft before saving."""
        self._access.member(household_id, actor.id)
        if reader is None:
            raise ServiceUnavailableError("Receipt reading is not available right now.")
        content_type = checked_document(data)
        if len(data) > get_settings().max_upload_bytes:
            raise InvalidInputError("That file is too large.")
        raw = reader.extract(
            data, filename=filename, content_type=content_type, schema=RECEIPT_SCHEMA
        )
        return to_draft(raw, datetime.now(UTC).date())

    def create(self, actor: User, household_id: uuid.UUID, data: ExpenseCreate) -> ExpenseRead:
        self._access.member(household_id, actor.id)
        household = self._lock(household_id)
        self._check_people(household_id, [data.paid_by, *[e.user_id for e in data.split.entries]])
        self._check_festival(household_id, data.festival_id)

        expense = self._expenses.add(
            Expense(
                household_id=household_id,
                festival_id=data.festival_id,
                description=data.description,
                category=data.category.value,
                amount_minor=data.amount_minor,
                paid_by=data.paid_by,
                spent_on=data.spent_on,
                split_type=data.split.type.value,
                notes=data.notes,
                created_by=actor.id,
                shares=self._shares(data.amount_minor, data.split),
            )
        )
        self._session.commit()
        return self._read(expense, household)

    def list_for_household(
        self,
        actor: User,
        household_id: uuid.UUID,
        festival_id: uuid.UUID | None,
        limit: int,
        offset: int,
    ) -> list[ExpenseRead]:
        self._access.member(household_id, actor.id)
        household = self._household(household_id)
        rows = self._expenses.list_for_household(household_id, festival_id, limit, offset)
        return [self._read(expense, household) for expense in rows]

    def get(self, actor: User, expense_id: uuid.UUID) -> ExpenseRead:
        expense = self._existing(expense_id)
        self._access.member(expense.household_id, actor.id)
        return self._read(expense, self._household(expense.household_id))

    def update(self, actor: User, expense_id: uuid.UUID, data: ExpenseUpdate) -> ExpenseRead:
        expense = self._existing(expense_id)
        self._require_owner_or_admin(actor, expense.household_id, expense.created_by)
        household = self._lock(expense.household_id)
        changes = data.model_dump(exclude_unset=True, exclude={"split", "amount_minor"})

        people = [changes["paid_by"]] if changes.get("paid_by") else []
        if data.split is not None and data.amount_minor is not None:
            people += [e.user_id for e in data.split.entries]
        self._check_people(expense.household_id, people)
        if "festival_id" in changes:
            self._check_festival(expense.household_id, changes["festival_id"])

        for field, value in changes.items():
            setattr(expense, field, value.value if hasattr(value, "value") else value)
        if data.split is not None and data.amount_minor is not None:
            expense.amount_minor = data.amount_minor
            expense.split_type = data.split.type.value
            expense.shares = self._shares(data.amount_minor, data.split)  # old rows are orphaned
        self._session.commit()
        return self._read(expense, household)

    def delete(self, actor: User, expense_id: uuid.UUID) -> None:
        expense = self._existing(expense_id)
        self._require_owner_or_admin(actor, expense.household_id, expense.created_by)
        self._lock(expense.household_id)
        self._expenses.delete(expense)
        self._session.commit()

    # ------------------------------------------------------------------------------ balances

    def balances(
        self, actor: User, household_id: uuid.UUID, festival_id: uuid.UUID | None
    ) -> BalancesRead:
        self._access.member(household_id, actor.id)
        household = self._household(household_id)
        paid = self._expenses.paid_totals(household_id, festival_id)
        owed = self._expenses.owed_totals(household_id, festival_id)
        # Payments between members are group-wide, so a single festival's tracker excludes them.
        sent, received = ({}, {}) if festival_id else self._expenses.settlement_totals(household_id)
        net = balances.net_balances(paid, owed, sent, received)
        transfers = balances.simplify(net)
        return BalancesRead(
            currency=household.currency,
            members=[
                MemberBalance(
                    user_id=person,
                    paid_minor=paid.get(person, 0),
                    owed_minor=owed.get(person, 0),
                    net_minor=amount,
                )
                for person, amount in sorted(net.items(), key=lambda x: (-x[1], str(x[0])))
            ],
            transfers=[TransferRead(**t.__dict__) for t in transfers],
            settled_up=not transfers,
        )

    def summary(
        self, actor: User, household_id: uuid.UUID, festival_id: uuid.UUID | None
    ) -> SummaryRead:
        self._access.member(household_id, actor.id)
        household = self._household(household_id)
        by_category, count = self._expenses.category_totals(household_id, festival_id)
        paid = self._expenses.paid_totals(household_id, festival_id)
        return SummaryRead(
            currency=household.currency,
            total_minor=sum(by_category.values()),
            count=count,
            by_category=by_category,
            by_payer={str(user) if user else "former": total for user, total in paid.items()},
        )

    # ---------------------------------------------------------------------------- settlements

    def settle(
        self, actor: User, household_id: uuid.UUID, data: SettlementCreate
    ) -> SettlementRead:
        member = self._access.member(household_id, actor.id)
        if actor.id not in (data.payer, data.payee) and member.role != "admin":
            raise InvalidInputError("You can only record payments you made or received")
        self._lock(household_id)
        self._check_people(household_id, [data.payer, data.payee])
        settlement = self._expenses.add_settlement(
            Settlement(
                household_id=household_id,
                payer=data.payer,
                payee=data.payee,
                amount_minor=data.amount_minor,
                settled_on=data.settled_on,
                created_by=actor.id,
            )
        )
        self._session.commit()
        return SettlementRead.model_validate(settlement)

    def list_settlements(
        self, actor: User, household_id: uuid.UUID, limit: int, offset: int
    ) -> list[SettlementRead]:
        self._access.member(household_id, actor.id)
        rows = self._expenses.list_settlements(household_id, limit, offset)
        return [SettlementRead.model_validate(row) for row in rows]

    def delete_settlement(self, actor: User, settlement_id: uuid.UUID) -> None:
        settlement = self._expenses.get_settlement(settlement_id)
        if settlement is None:
            raise NotFoundError("Payment not found")
        self._require_owner_or_admin(actor, settlement.household_id, settlement.created_by)
        self._lock(settlement.household_id)
        self._expenses.delete_settlement(settlement)
        self._session.commit()

    # --------------------------------------------------------------------------- internals

    def _lock(self, household_id: uuid.UUID) -> Household:
        """Writers queue behind a group deletion (see docs/concurrency.md), then re-read it."""
        if self._households.lock_for_children(household_id) is None:
            raise NotFoundError("Household not found")
        return self._household(household_id)

    def _household(self, household_id: uuid.UUID) -> Household:
        household = self._households.get(household_id)
        if household is None:
            raise NotFoundError("Household not found")
        return household

    def _existing(self, expense_id: uuid.UUID) -> Expense:
        expense = self._expenses.get(expense_id)
        if expense is None:
            raise NotFoundError("Expense not found")
        return expense

    def _require_owner_or_admin(
        self, actor: User, household_id: uuid.UUID, owner: uuid.UUID | None
    ) -> None:
        member = self._access.member(household_id, actor.id)
        if actor.id != owner and member.role != "admin":
            raise InvalidInputError(
                "Only the person who added this, or a group admin, can change it"
            )

    def _check_people(self, household_id: uuid.UUID, people: list[uuid.UUID]) -> None:
        if not set(people) <= self._households.list_member_ids(household_id):
            raise InvalidInputError("Everyone in an expense must be a member of the group")

    def _check_festival(self, household_id: uuid.UUID, festival_id: uuid.UUID | None) -> None:
        if festival_id is None:
            return
        festival = self._festivals.get(festival_id)
        if festival is None or festival.household_id != household_id:
            raise NotFoundError("Festival not found")

    @staticmethod
    def _shares(total: int, data: SplitInput) -> list[ExpenseShare]:
        try:
            parts = split(total, data.type, [(e.user_id, e.value) for e in data.entries])
        except SplitError as exc:
            raise InvalidInputError(str(exc)) from exc
        return [ExpenseShare(user_id=user, amount_minor=amount) for user, amount in parts.items()]

    @staticmethod
    def _read(expense: Expense, household: Household) -> ExpenseRead:
        return ExpenseRead.model_validate(expense).model_copy(
            update={"currency": household.currency}
        )
