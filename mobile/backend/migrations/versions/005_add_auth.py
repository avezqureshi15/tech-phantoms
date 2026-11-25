"""
Add Google Identity To Users And Refresh Tokens Table
Revision ID: 005
Revises: 004
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "005"
down_revision: str | None = "004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("google_sub", sa.String(255), nullable=True)
    )
    op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])

    # Only a SHA-256 of each refresh token is stored, never the token itself.
    op.create_table(
        "refresh_tokens",

        sa.Column("id", sa.UUID(), primary_key=True),

        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey(
                "users.id",
                name="fk_refresh_tokens_user_id_users",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        sa.Column("token_hash", sa.String(64), nullable=False),

        sa.Column(
            "expires_at",
            sa.DateTime(timezone=True),
            nullable=False
        ),

        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=True
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),

        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash")
    )

    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_constraint("uq_users_google_sub", "users", type_="unique")
    op.drop_column("users", "google_sub")
