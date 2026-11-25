import uuid
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    orm,
)
from sqlalchemy.orm import Mapped, mapped_column

from festiveos.db.base import Base

# Money is stored as integer minor units (paise). A person who leaves keeps their rows under a
# NULL user, so balances stay correct and nobody's account deletion is blocked by a debt.


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_expenses_amount_positive"),
        Index("ix_expenses_household_spent_on", "household_id", "spent_on"),
        Index("ix_expenses_festival_id", "festival_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"))
    festival_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("festivals.id", ondelete="SET NULL")
    )
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(24))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    paid_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    spent_on: Mapped[date] = mapped_column(Date)
    split_type: Mapped[str] = mapped_column(String(10))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    shares: Mapped[list["ExpenseShare"]] = orm.relationship(
        lazy="raise", cascade="all, delete-orphan"
    )


class ExpenseShare(Base):
    __tablename__ = "expense_shares"
    __table_args__ = (
        CheckConstraint("amount_minor >= 0", name="ck_expense_shares_amount_non_negative"),
        Index("ix_expense_shares_expense_id", "expense_id"),
        Index("ix_expense_shares_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    expense_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("expenses.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    amount_minor: Mapped[int] = mapped_column(BigInteger)


class Settlement(Base):
    """A payment between two members that reduces what one owes the other."""

    __tablename__ = "settlements"
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_settlements_amount_positive"),
        Index("ix_settlements_household_id", "household_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("households.id", ondelete="CASCADE"))
    payer: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    payee: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    settled_on: Mapped[date] = mapped_column(Date)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
