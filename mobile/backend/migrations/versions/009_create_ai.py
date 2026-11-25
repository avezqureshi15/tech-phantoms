"""
Create AI Conversations, Messages And Pending Cards
Revision ID: 009
Revises: 008
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "009"
down_revision: str | None = "008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "household_id",
            sa.UUID(),
            sa.ForeignKey(
                "households.id", name="fk_ai_conversations_household_id_households", ondelete="CASCADE"
            ),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", name="fk_ai_conversations_user_id_users", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("active_agent", sa.String(24), server_default="sutradhar", nullable=False),
        sa.Column("message_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("turn_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_ai_conversations_user_household", "ai_conversations", ["user_id", "household_id"]
    )

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.UUID(),
            sa.ForeignKey(
                "ai_conversations.id",
                name="fk_ai_messages_conversation_id_ai_conversations",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        # json, not jsonb: jsonb reorders keys and replayed history must be byte-stable.
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("ui", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("conversation_id", "seq", name="uq_ai_messages_seq"),
    )

    op.create_table(
        "ai_pending_cards",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.UUID(),
            sa.ForeignKey(
                "ai_conversations.id",
                name="fk_ai_pending_cards_conversation_id_ai_conversations",
                ondelete="CASCADE",
            ),
            nullable=False,
        ),
        sa.Column("tool_use_id", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("card", sa.JSON(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(12), server_default="open", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "uq_ai_pending_cards_one_open",
        "ai_pending_cards",
        ["conversation_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index("uq_ai_pending_cards_one_open", table_name="ai_pending_cards")
    op.drop_table("ai_pending_cards")
    op.drop_table("ai_messages")
    op.drop_index("ix_ai_conversations_user_household", table_name="ai_conversations")
    op.drop_table("ai_conversations")
