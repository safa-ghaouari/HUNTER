"""Add source health tracking for retry backoff and auto-disable.

Revision ID: 20260424_0005
Revises: 20260420_0004
Create Date: 2026-04-24 00:00:00
"""

from alembic import op
import sqlalchemy as sa

revision = "20260424_0005"
down_revision = "20260420_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sources", sa.Column("last_attempted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("sources", sa.Column("last_failed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "sources",
        sa.Column(
            "consecutive_failures",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column("sources", sa.Column("last_error_message", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("sources", "last_error_message")
    op.drop_column("sources", "consecutive_failures")
    op.drop_column("sources", "last_failed_at")
    op.drop_column("sources", "last_attempted_at")
