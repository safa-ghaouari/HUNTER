"""Asset model — client environment inventory (Couche 4 — Intégration Client).

Assets represent the hosts, devices, and instances that make up a client's
IT environment.  They are populated in two ways:

  1. Automatic discovery:
       - OpenVAS/Greenbone scan results → CVE findings linked to assets
       - Logstash log normalisation: hostname / IP extracted from Windows
         Event logs, Syslog, CEF → asset auto-registered if not seen before

  2. Manual registration:
       - SOC analyst creates an asset via the admin API when on-boarding
         a new client

Assets are the pivot point in correlation:
  Elasticsearch hit (hostname/IP in client logs)
    → matched to an Asset row
    → Alert.asset_id set → analyst knows which host is compromised

`criticality` drives alert prioritisation:
  A CRITICAL asset (domain controller, SIEM, backup server) hit by a
  HIGH severity IoC → the resulting Alert is escalated immediately.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, ForeignKey, String, func, text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from backend.models.base import Base
from backend.models.enums import AssetCriticality, AssetType


class Asset(Base):
    __tablename__ = "assets"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # Ownership
    # ------------------------------------------------------------------
    client_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="The MSSP client that owns this asset",
    )

    # ------------------------------------------------------------------
    # Network identity (at least one of hostname / ip_address must be set)
    # ------------------------------------------------------------------
    hostname: Mapped[str | None] = mapped_column(
        String(255), nullable=True, index=True,
        comment="FQDN or NetBIOS name as it appears in client logs",
    )
    ip_address: Mapped[str | None] = mapped_column(
        INET, nullable=True, index=True,
        comment=(
            "Primary IP address (IPv4 or IPv6) stored as PostgreSQL INET. "
            "Enables efficient subnet queries (e.g. ip_address << '10.0.0.0/8')"
        ),
    )

    # ------------------------------------------------------------------
    # Classification
    # ------------------------------------------------------------------
    asset_type: Mapped[AssetType] = mapped_column(
        SqlEnum(AssetType, name="asset_type_enum"),
        nullable=False,
        default=AssetType.OTHER,
        comment="Category for filtering and dashboard grouping",
    )
    os: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        comment="Operating system as reported by OpenVAS or asset agent",
    )
    criticality: Mapped[AssetCriticality] = mapped_column(
        SqlEnum(AssetCriticality, name="asset_criticality_enum"),
        nullable=False,
        default=AssetCriticality.MEDIUM,
        comment=(
            "Business criticality — affects alert severity escalation. "
            "CRITICAL: DC, SIEM, backup servers. HIGH: file servers, VPNs."
        ),
    )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true"),
        comment="Inactive assets are excluded from correlation to avoid stale hits",
    )
    discovered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="When the asset was first seen in logs or scanned by OpenVAS",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    client: Mapped["Client"] = relationship(  # noqa: F821
        "Client", back_populates="assets", lazy="joined"
    )
    # Alerts where this asset was the impacted host
    alerts: Mapped[list["Alert"]] = relationship(  # noqa: F821
        "Alert", back_populates="asset", lazy="noload"
    )
