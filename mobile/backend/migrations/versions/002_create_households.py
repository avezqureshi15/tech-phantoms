"""
Create Households and Household Members Tables
Revision ID: 002
Revises: 001
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "002"
down_revision: str | None = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "households",

        sa.Column("id", sa.UUID(), primary_key=True),

        sa.Column("name", sa.Text(), nullable=False),

        sa.Column(
            "created_by",
            sa.UUID(),
            sa.ForeignKey(
                "users.id",
                name="fk_households_created_by_users",
                ondelete="RESTRICT"
            ),
            nullable=False
        ),

        sa.Column(
            "timezone",
            sa.String(64),
            server_default="Asia/Kolkata",
            nullable=False
        ),

        sa.Column("location", sa.Text(), nullable=True),

        sa.Column(
            "currency",
            sa.String(3),
            server_default="INR",
            nullable=False
        ),

        sa.Column(
            "default_language",
            sa.String(8),
            server_default="en",
            nullable=False
        ),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        )
    )

    op.create_index("ix_households_created_by", "households", ["created_by"])

    op.create_table(
        "household_members",

        sa.Column(
            "household_id",
            sa.UUID(),
            sa.ForeignKey(
                "households.id",
                name="fk_household_members_household_id_households",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey(
                "users.id",
                name="fk_household_members_user_id_users",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        sa.Column("relationship", sa.String(32), nullable=True),

        sa.Column(
            "role",
            sa.String(16),
            server_default="member",
            nullable=False
        ),

        sa.Column(
            "notification_preference",
            sa.String(16),
            server_default="all",
            nullable=False
        ),

        sa.Column(
            "joined_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),

        sa.PrimaryKeyConstraint(
            "household_id",
            "user_id",
            name="pk_household_members"
        ),

        sa.CheckConstraint(
            "role IN ('admin', 'member')",
            name="ck_household_members_role"
        ),

        sa.CheckConstraint(
            "notification_preference IN ('all', 'important', 'none')",
            name="ck_household_members_notification_preference"
        )
    )

    op.create_index(
        "ix_household_members_user_id",
        "household_members",
        ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_household_members_user_id", table_name="household_members")
    op.drop_table("household_members")
    op.drop_index("ix_households_created_by", table_name="households")
    op.drop_table("households")
