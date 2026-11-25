"""
Add The Faiths A Household Follows And Its Panchang City
Revision ID: 010
Revises: 009
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "010"
down_revision: str | None = "009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Empty faiths means "show every festival", so existing households behave as before.
    op.add_column(
        "households", sa.Column("faiths", sa.JSON(), server_default="[]", nullable=False)
    )
    op.add_column(
        "households",
        sa.Column("panchang_city", sa.String(32), server_default="delhi", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("households", "panchang_city")
    op.drop_column("households", "faiths")
