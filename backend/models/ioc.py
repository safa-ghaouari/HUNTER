"""IoC model — Couche 3 (Stockage & Corrélation).

An Indicator of Compromise is the core data artefact produced by the NLP
pipeline and stored in both PostgreSQL (for the API) and MISP (for the
correlation engine).

Extraction flow:
  collection task → raw article text
    → spaCy NER      (IPs, CVEs, hashes, domains, malware names)
    → iocextract     (regex: URLs, MD5/SHA256, emails, defanging)
    → SecBERT        (classification: phishing / ransomware / APT…)
    → stored here as IoC rows linked to their hunting_job

Correlation flow:
  IoC.value (normalised) → Elasticsearch query against client logs
  → hit → Alert created → alert_iocs row added

Each IoC carries:
  - its raw value  (e.g. "192[.]168.1.1" as extracted)
  - a normalised value (e.g. "192.168.1.1" after defanging)
  - TLP classification for sharing decisions
  - MISP event ID and OpenCTI ID for round-trip sync
  - confidence score produced by the NLP pipeline (0–100)
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from backend.models.associations import alert_iocs, ioc_tags, threat_iocs
from backend.models.base import Base
from backend.models.enums import IocType, Severity, TlpLevel


class IoC(Base):
    __tablename__ = "iocs"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # ------------------------------------------------------------------
    # Type & value
    # ------------------------------------------------------------------
    type: Mapped[IocType] = mapped_column(
        SqlEnum(IocType, name="ioc_type_enum"),
        nullable=False,
        index=True,
        comment="Category determines how the value is queried in Elasticsearch",
    )
    value: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="Raw extracted value exactly as found in the source (may be defanged)",
    )
    value_normalized: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment=(
            "Cleaned value used for deduplication and Elasticsearch queries. "
            "For IPs: '192[.]168.1.1' → '192.168.1.1'. "
            "For domains: 'evil[.]com' → 'evil.com'. "
            "For hashes: lowercased."
        ),
    )

    # ------------------------------------------------------------------
    # Risk classification
    # ------------------------------------------------------------------
    severity: Mapped[Severity] = mapped_column(
        SqlEnum(Severity, name="severity_enum"),
        nullable=False,
        index=True,
        default=Severity.MEDIUM,
        comment="Risk level — drives alert severity when this IoC hits a client log",
    )
    confidence: Mapped[int] = mapped_column(
        Integer, nullable=False, default=50,
        comment="NLP pipeline confidence score (0–100). Below 30 = needs manual review",
    )
    tlp: Mapped[TlpLevel] = mapped_column(
        SqlEnum(TlpLevel, name="tlp_level_enum"),
        nullable=False,
        default=TlpLevel.AMBER,
        comment="TLP 2.0 sharing restriction — controls what clients can see",
    )

    # ------------------------------------------------------------------
    # Origin & external references
    # ------------------------------------------------------------------
    source_type: Mapped[str] = mapped_column(
        String(100), nullable=False,
        comment="Which collection module produced this IoC (misp / otx / rss / manual…)",
    )
    misp_event_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        comment="MISP event UUID — allows round-trip sync with the MISP instance",
    )
    opencti_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True,
        comment="OpenCTI observable STIX ID — used by the OpenCTI connector",
    )
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="LangChain/Ollama generated summary or analyst note",
    )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true"),
        comment="Inactive IoCs are excluded from correlation queries",
    )
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
        comment="When this IoC was first observed across all sources",
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(),
        comment="Last time this IoC appeared in any source — updated on re-extraction",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ------------------------------------------------------------------
    # Enrichment
    # ------------------------------------------------------------------
    enrichment: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True,
        comment="VirusTotal / Shodan / AbuseIPDB enrichment results",
    )

    # ------------------------------------------------------------------
    # Pipeline link
    # ------------------------------------------------------------------
    hunting_job_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hunting_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="The NLP/collection job that extracted this IoC — null for manually added",
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    hunting_job: Mapped["HuntingJob"] = relationship(  # noqa: F821
        "HuntingJob", back_populates="iocs", lazy="joined"
    )
    # Tags: lightweight labels — selectin is acceptable (few tags per IoC)
    tags: Mapped[list["Tag"]] = relationship(  # noqa: F821
        "Tag", secondary=ioc_tags, back_populates="iocs", lazy="selectin"
    )
    # Threats: which malware families / actors this IoC is attributed to
    threats: Mapped[list["Threat"]] = relationship(  # noqa: F821
        "Threat", secondary=threat_iocs, back_populates="iocs", lazy="selectin"
    )
    # Alerts: which correlation hits referenced this IoC
    alerts: Mapped[list["Alert"]] = relationship(  # noqa: F821
        "Alert", secondary=alert_iocs, back_populates="iocs", lazy="noload"
    )
