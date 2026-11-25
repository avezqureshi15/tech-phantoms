"""
Create Expenses, Expense Shares And Settlements
Revision ID: 012
Revises: 011
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "012"
down_revision: str | None = "011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _user_fk(name: str, column: str) -> sa.Column:
    # A person who leaves keeps their rows under NULL: balances stay right and no debt blocks
    # an account deletion.
    return sa.Column(
        column,
        sa.UUID(),
        sa.ForeignKey("users.id", name=name, ondelete="SET NULL"),
        nullable=True,
    )


def upgrade() -> None:
    op.create_table(
        "expenses",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "household_id",
            sa.UUID(),
            sa.ForeignKey("households.id", name="fk_expenses_household_id_households", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "festival_id",
            sa.UUID(),
            sa.ForeignKey("festivals.id", name="fk_expenses_festival_id_festivals", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(24), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        _user_fk("fk_expenses_paid_by_users", "paid_by"),
        sa.Column("spent_on", sa.Date(), nullable=False),
        sa.Column("split_type", sa.String(10), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        _user_fk("fk_expenses_created_by_users", "created_by"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name="ck_expenses_amount_positive"),
    )
    op.create_index("ix_expenses_household_spent_on", "expenses", ["household_id", "spent_on"])
    op.create_index("ix_expenses_festival_id", "expenses", ["festival_id"])

    op.create_table(
        "expense_shares",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "expense_id",
            sa.UUID(),
            sa.ForeignKey("expenses.id", name="fk_expense_shares_expense_id_expenses", ondelete="CASCADE"),
            nullable=False,
        ),
        _user_fk("fk_expense_shares_user_id_users", "user_id"),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.CheckConstraint("amount_minor >= 0", name="ck_expense_shares_amount_non_negative"),
    )
    op.create_index("ix_expense_shares_expense_id", "expense_shares", ["expense_id"])
    op.create_index("ix_expense_shares_user_id", "expense_shares", ["user_id"])

    op.create_table(
        "settlements",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "household_id",
            sa.UUID(),
            sa.ForeignKey("households.id", name="fk_settlements_household_id_households", ondelete="CASCADE"),
            nullable=False,
        ),
        _user_fk("fk_settlements_payer_users", "payer"),
        _user_fk("fk_settlements_payee_users", "payee"),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("settled_on", sa.Date(), nullable=False),
        _user_fk("fk_settlements_created_by_users", "created_by"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name="ck_settlements_amount_positive"),
    )
    op.create_index("ix_settlements_household_id", "settlements", ["household_id"])


def downgrade() -> None:
    op.drop_index("ix_settlements_household_id", table_name="settlements")
    op.drop_table("settlements")
    op.drop_index("ix_expense_shares_user_id", table_name="expense_shares")
    op.drop_index("ix_expense_shares_expense_id", table_name="expense_shares")
    op.drop_table("expense_shares")
    op.drop_index("ix_expenses_festival_id", table_name="expenses")
    op.drop_index("ix_expenses_household_spent_on", table_name="expenses")
    op.drop_table("expenses")
