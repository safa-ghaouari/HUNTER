"""Add connection fields to clients table.

Revision ID: 20260420_0004
Revises: 20260418_0003
Create Date: 2026-04-20 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "20260420_0004"
down_revision = "20260418_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clients", sa.Column("connection_type", sa.String(32), nullable=True))
    op.add_column("clients", sa.Column("openvas_url", sa.String(512), nullable=True))
    op.add_column("clients", sa.Column("secureworks_url", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("clients", "secureworks_url")
    op.drop_column("clients", "openvas_url")
    op.drop_column("clients", "connection_type")
