"""
Create Festivals and Festival Events Tables
Revision ID: 003
Revises: 002
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "003"
down_revision: str | None = "002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "festivals",

        sa.Column("id", sa.UUID(), primary_key=True),

        sa.Column(
            "household_id",
            sa.UUID(),
            sa.ForeignKey(
                "households.id",
                name="fk_festivals_household_id_households",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        # Not a DB enum: new festival types must not need a migration.
        sa.Column("type", sa.String(32), nullable=False),

        sa.Column("name", sa.Text(), nullable=False),

        sa.Column("start_date", sa.Date(), nullable=False),

        sa.Column("end_date", sa.Date(), nullable=False),

        sa.Column(
            "status",
            sa.String(16),
            server_default="planning",
            nullable=False
        ),

        sa.Column(
            "readiness_score",
            sa.SmallInteger(),
            server_default="0",
            nullable=False
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
        ),

        sa.CheckConstraint(
            "end_date >= start_date",
            name="ck_festivals_dates"
        ),

        sa.CheckConstraint(
            "status IN ('planning', 'active', 'completed', 'cancelled')",
            name="ck_festivals_status"
        ),

        sa.CheckConstraint(
            "readiness_score BETWEEN 0 AND 100",
            name="ck_festivals_readiness_score"
        )
    )

    op.create_index(
        "ix_festivals_household_id_start_date",
        "festivals",
        ["household_id", "start_date"]
    )

    op.create_table(
        "festival_events",

        sa.Column("id", sa.UUID(), primary_key=True),

        sa.Column(
            "festival_id",
            sa.UUID(),
            sa.ForeignKey(
                "festivals.id",
                name="fk_festival_events_festival_id_festivals",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        sa.Column("name", sa.Text(), nullable=False),

        sa.Column("event_date", sa.Date(), nullable=False),

        sa.Column("start_time", sa.Time(), nullable=True),

        sa.Column("end_time", sa.Time(), nullable=True),

        sa.Column("location", sa.Text(), nullable=True),

        sa.Column("description", sa.Text(), nullable=True)
    )

    op.create_index(
        "ix_festival_events_festival_id_event_date",
        "festival_events",
        ["festival_id", "event_date"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_festival_events_festival_id_event_date",
        table_name="festival_events"
    )
    op.drop_table("festival_events")
    op.drop_index("ix_festivals_household_id_start_date", table_name="festivals")
    op.drop_table("festivals")
