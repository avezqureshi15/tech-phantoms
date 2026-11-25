"""
Keep Households And Traditions When Their Creator Deletes Their Account
Revision ID: 007
Revises: 006
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "007"
down_revision: str | None = "006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, constraint) pairs whose creator column used to be NOT NULL with ON DELETE RESTRICT.
CREATOR_KEYS = [
    ("households", "fk_households_created_by_users"),
    ("traditions", "fk_traditions_created_by_users"),
]


def upgrade() -> None:
    for table, constraint in CREATOR_KEYS:
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.alter_column(table, "created_by", existing_type=sa.UUID(), nullable=True)
        op.create_foreign_key(
            constraint, table, "users", ["created_by"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    for table, constraint in CREATOR_KEYS:
        orphans = op.get_bind().execute(
            sa.text(f"SELECT count(*) FROM {table} WHERE created_by IS NULL")
        ).scalar_one()
        if orphans:
            raise RuntimeError(
                f"Cannot downgrade: {orphans} row(s) in {table} have no creator "
                "(their creator deleted their account)."
            )
        op.drop_constraint(constraint, table, type_="foreignkey")
        op.alter_column(table, "created_by", existing_type=sa.UUID(), nullable=False)
        op.create_foreign_key(
            constraint, table, "users", ["created_by"], ["id"], ondelete="RESTRICT"
        )
