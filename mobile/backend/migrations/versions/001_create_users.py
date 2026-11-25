"""
Create Users Table
Revision ID: 001
Revises:
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",

        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True
        ),

        sa.Column(
            "name",
            sa.Text(),
            nullable=False
        ),

        sa.Column(
            "email",
            sa.Text(),
            unique=True,
            nullable=False
        ),

        sa.Column(
            "phone",
            sa.String(16),  # E.164: "+" followed by up to 15 digits
            nullable=True,
        ),

        sa.Column(
            "avatar_url",
            sa.String(),
            nullable=True
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),

        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        )
    )


def downgrade() -> None:
    op.drop_table("users")
