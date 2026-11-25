"""
Add Group Kind, Icon And Colour
Revision ID: 011
Revises: 010
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "011"
down_revision: str | None = "010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Every existing group is a household, which is what it always was.
    op.add_column(
        "households", sa.Column("kind", sa.String(16), server_default="household", nullable=False)
    )
    op.add_column("households", sa.Column("icon", sa.String(40), nullable=True))
    op.add_column("households", sa.Column("color", sa.String(7), nullable=True))


def downgrade() -> None:
    op.drop_column("households", "color")
    op.drop_column("households", "icon")
    op.drop_column("households", "kind")
