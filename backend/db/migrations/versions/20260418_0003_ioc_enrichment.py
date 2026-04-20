"""Add enrichment JSONB column to iocs table.

Revision ID: 20260418_0003
Revises: 20260413_0002
Create Date: 2026-04-18 00:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260418_0003"
down_revision = "20260413_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "iocs",
        sa.Column(
            "enrichment",
            JSONB,
            nullable=True,
            comment="VirusTotal / Shodan / AbuseIPDB enrichment results",
        ),
    )


def downgrade() -> None:
    op.drop_column("iocs", "enrichment")
