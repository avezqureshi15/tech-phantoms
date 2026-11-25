"""
Create Traditions and Tradition Occurrences Tables
Revision ID: 004
Revises: 003
Create Date: 2026-11-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "004"
down_revision: str | None = "003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # A tradition recurs every year, so it is keyed by festival_type rather
    # than a single festival instance. Each year it is performed is an
    # occurrence, which doubles as the tradition history.
    op.create_table(
        "traditions",

        sa.Column("id", sa.UUID(), primary_key=True),

        sa.Column(
            "household_id",
            sa.UUID(),
            sa.ForeignKey(
                "households.id",
                name="fk_traditions_household_id_households",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        sa.Column("festival_type", sa.String(32), nullable=False),

        sa.Column("name", sa.Text(), nullable=False),

        sa.Column("category", sa.String(16), nullable=False),

        sa.Column(
            "scope",
            sa.String(16),
            server_default="family",
            nullable=False
        ),

        sa.Column("description", sa.Text(), nullable=True),

        sa.Column("origin", sa.Text(), nullable=True),

        sa.Column("significance", sa.Text(), nullable=True),

        sa.Column("instructions", sa.Text(), nullable=True),

        sa.Column("region", sa.String(64), nullable=True),

        sa.Column("started_year", sa.SmallInteger(), nullable=True),

        sa.Column(
            "active",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False
        ),

        sa.Column(
            "created_by",
            sa.UUID(),
            sa.ForeignKey(
                "users.id",
                name="fk_traditions_created_by_users",
                ondelete="RESTRICT"
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
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),

        sa.CheckConstraint(
            "scope IN ('global', 'regional', 'community', 'family')",
            name="ck_traditions_scope"
        )
    )

    op.create_index(
        "ix_traditions_household_id_festival_type",
        "traditions",
        ["household_id", "festival_type"]
    )

    op.create_index("ix_traditions_created_by", "traditions", ["created_by"])

    op.create_table(
        "tradition_occurrences",

        sa.Column("id", sa.UUID(), primary_key=True),

        sa.Column(
            "tradition_id",
            sa.UUID(),
            sa.ForeignKey(
                "traditions.id",
                name="fk_tradition_occurrences_tradition_id_traditions",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        sa.Column(
            "festival_id",
            sa.UUID(),
            sa.ForeignKey(
                "festivals.id",
                name="fk_tradition_occurrences_festival_id_festivals",
                ondelete="CASCADE"
            ),
            nullable=False
        ),

        sa.Column(
            "performed_by",
            sa.UUID(),
            sa.ForeignKey(
                "users.id",
                name="fk_tradition_occurrences_performed_by_users",
                ondelete="SET NULL"
            ),
            nullable=True
        ),

        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True
        ),

        sa.Column("notes", sa.Text(), nullable=True),

        sa.Column("photo_url", sa.String(), nullable=True),

        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False
        ),

        # One occurrence per tradition per festival. Its index also serves
        # tradition -> history lookups.
        sa.UniqueConstraint(
            "tradition_id",
            "festival_id",
            name="uq_tradition_occurrences_tradition_id_festival_id"
        )
    )

    op.create_index(
        "ix_tradition_occurrences_festival_id",
        "tradition_occurrences",
        ["festival_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_tradition_occurrences_festival_id",
        table_name="tradition_occurrences"
    )
    op.drop_table("tradition_occurrences")
    op.drop_index("ix_traditions_created_by", table_name="traditions")
    op.drop_index(
        "ix_traditions_household_id_festival_type",
        table_name="traditions"
    )
    op.drop_table("traditions")
