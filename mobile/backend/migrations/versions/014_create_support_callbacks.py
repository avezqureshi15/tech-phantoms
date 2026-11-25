"""
Record Requests For A Call Back (Without The Phone Number)
Revision ID: 014
Revises: 013
Create Date: 2026-11-25
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "014"
down_revision: str | None = "013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "support_callbacks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("topic", sa.String(32), nullable=False),
        sa.Column("language", sa.String(10), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("remote_id", sa.String(64), nullable=True),
        sa.Column("consent_text_version", sa.String(16), nullable=False),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_support_callbacks_user_created", "support_callbacks", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_support_callbacks_user_created", table_name="support_callbacks")
    op.drop_table("support_callbacks")
