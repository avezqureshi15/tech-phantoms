"""
Create Inventory Items
Revision ID: 008
Revises: 007
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "008"
down_revision: str | None = "007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "inventory_items",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "household_id",
            sa.UUID(),
            sa.ForeignKey(
                "households.id",
                name="fk_inventory_items_household_id_households",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        # Not a DB enum: new categories must not need a migration.
        sa.Column("category", sa.String(16), nullable=False),
        sa.Column("quantity", sa.SmallInteger(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("quantity >= 0", name="ck_inventory_items_quantity_non_negative"),
    )
    op.create_index(
        "ix_inventory_items_household_id_name", "inventory_items", ["household_id", "name"]
    )


def downgrade() -> None:
    op.drop_index("ix_inventory_items_household_id_name", table_name="inventory_items")
    op.drop_table("inventory_items")
