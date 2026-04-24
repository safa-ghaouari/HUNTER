"""Source model — Couche 1 (Collecte de données).

A Source is a configured external data provider that the collection pipeline
polls to ingest raw cyber-threat intelligence.  Examples:
  - RSS feed  → Feedparser pulls articles from CERT-FR, SANS-ISC…
  - misp_feed → MISP imports AlienVault OTX / Abuse.ch / CIRCL feeds
  - otx       → direct AlienVault OTX API
  - secureworks → Taegis XDR API for a specific client environment

Each source can be enabled/disabled independently and carries its own
polling cadence.  API credentials are stored in HashiCorp Vault; only
the Vault path is persisted here.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from backend.models.base import Base
from backend.models.enums import SourceType


class Source(Base):
    __tablename__ = "sources"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False,
        comment="Human-readable label shown in the admin UI (e.g. 'CERT-FR RSS')",
    )
    type: Mapped[SourceType] = mapped_column(
        SqlEnum(SourceType, name="source_type_enum"),
        nullable=False,
        comment="Determines which collector module handles this source",
    )

    # ------------------------------------------------------------------
    # Connection
    # ------------------------------------------------------------------
    url: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="Feed / API endpoint URL (null for sources that use Vault credentials only)",
    )
    api_key_vault_path: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        comment="HashiCorp Vault path where the API key is stored (e.g. secret/sources/otx)",
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Owning client for client-specific sources such as Secureworks collectors",
    )

    # ------------------------------------------------------------------
    # Polling configuration
    # ------------------------------------------------------------------
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true"),
        comment="Inactive sources are skipped by the Celery collection beat",
    )
    polling_interval_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60,
        comment="How often the Celery beat should trigger a collection task for this source",
    )
    last_polled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Timestamp of the most recent successful poll — null if never polled",
    )
    last_attempted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Timestamp of the most recent collection attempt (success or failure)",
    )
    last_failed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="Timestamp of the most recent failed collection attempt",
    )
    consecutive_failures: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0"),
        comment="How many collection attempts have failed in a row",
    )
    last_error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="Last collection error recorded for the source",
    )

    # ------------------------------------------------------------------
    # Audit
    # ------------------------------------------------------------------
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    # A source can be referenced by many hunting jobs (e.g. a recurring
    # collection job scheduled for this feed).
    hunting_jobs: Mapped[list["HuntingJob"]] = relationship(  # noqa: F821
        "HuntingJob", back_populates="source", lazy="noload"
    )
    client: Mapped["Client | None"] = relationship(  # noqa: F821
        "Client", back_populates="sources", lazy="joined"
    )
