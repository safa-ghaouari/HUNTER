"""Add optional client ownership to sources.

Revision ID: 20260424_0006
Revises: 20260424_0005
Create Date: 2026-04-24 00:00:01
"""

from alembic import op
import sqlalchemy as sa

revision = "20260424_0006"
down_revision = "20260424_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sources", sa.Column("client_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_sources_client_id"), "sources", ["client_id"], unique=False)
    op.create_foreign_key(
        "fk_sources_client_id_clients",
        "sources",
        "clients",
        ["client_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint("fk_sources_client_id_clients", "sources", type_="foreignkey")
    op.drop_index(op.f("ix_sources_client_id"), table_name="sources")
    op.drop_column("sources", "client_id")
