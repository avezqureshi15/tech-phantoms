"""
Add The Faiths A Person Follows And Their Home City
Revision ID: 013
Revises: 012
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "013"
down_revision: str | None = "012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing users have not been asked yet: empty faiths and no answer recorded.
    op.add_column("users", sa.Column("faiths", sa.JSON(), server_default="[]", nullable=False))
    op.add_column("users", sa.Column("faith_chosen_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("home_city", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "home_city")
    op.drop_column("users", "faith_chosen_at")
    op.drop_column("users", "faiths")
