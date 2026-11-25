"""
Add Auth Sessions So Logout Can Revoke Access Tokens
Revision ID: 006
Revises: 005
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "006"
down_revision: str | None = "005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # One row per sign-in (per device). Access tokens carry the session id, and every
    # request checks it is still live, which is what lets logout take effect immediately.
    op.create_table(
        "auth_sessions",

        sa.Column("id", sa.UUID(), primary_key=True),

        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey(
                "users.id",
                name="fk_auth_sessions_user_id_users",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),

        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=True
        )
    )

    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])

    # Existing refresh tokens have no session to belong to, so they are discarded:
    # every signed-in device simply signs in again once after this migration.
    op.execute("DELETE FROM refresh_tokens")

    op.add_column(
        "refresh_tokens",
        sa.Column(
            "session_id",
            sa.UUID(),
            sa.ForeignKey(
                "auth_sessions.id",
                name="fk_refresh_tokens_session_id_auth_sessions",
                ondelete="CASCADE"
            ),
            nullable=False
        )
    )

    op.create_index("ix_refresh_tokens_session_id", "refresh_tokens", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_session_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "session_id")
    op.drop_index("ix_auth_sessions_user_id", table_name="auth_sessions")
    op.drop_table("auth_sessions")
