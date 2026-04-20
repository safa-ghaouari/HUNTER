"""Threat model — grouped threat intelligence entity.

A Threat represents a named, classified piece of threat intelligence:
  - Malware family   (e.g. LockBit 3.0, BlackCat, Emotet)
  - Threat actor     (e.g. APT28 / Fancy Bear, Lazarus Group)
  - Campaign         (e.g. Operation SolarWinds, HermeticWiper campaign)
  - Offensive tool   (e.g. Cobalt Strike, Mimikatz)
  - ATT&CK technique (standalone mapping entry)

Relationship to the pipeline:
  NLP pipeline (SecBERT + sklearn clustering) groups extracted IoCs into
  a Threat entity and maps them to MITRE ATT&CK techniques.
  The Threat is then pushed to OpenCTI as a STIX 2.1 threat-actor /
  malware / campaign object.

`mitre_techniques` stores an array of ATT&CK technique IDs so the
MITRE ATT&CK Navigator can render the detection coverage heatmap.
Example: ["T1566.001", "T1059.001", "T1486"]
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from backend.models.associations import threat_iocs
from backend.models.base import Base
from backend.models.enums import Severity, ThreatType


class Threat(Base):
    __tablename__ = "threats"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True,
        comment="Canonical threat name as used in threat intel reports (e.g. 'LockBit 3.0')",
    )
    type: Mapped[ThreatType] = mapped_column(
        SqlEnum(ThreatType, name="threat_type_enum"),
        nullable=False,
        index=True,
        comment="STIX 2.1-inspired classification",
    )

    # ------------------------------------------------------------------
    # Intelligence content
    # ------------------------------------------------------------------
    description: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="LangChain/Ollama RAG-generated summary enriched with external intel",
    )
    mitre_techniques: Mapped[list[str]] = mapped_column(
        ARRAY(String(20)), nullable=False, default=list,
        comment=(
            "ATT&CK technique IDs observed for this threat. "
            "Used by the MITRE ATT&CK Navigator layer export."
        ),
    )
    severity: Mapped[Severity] = mapped_column(
        SqlEnum(Severity, name="severity_enum"),
        nullable=False,
        index=True,
        default=Severity.HIGH,
        comment="Overall severity of the threat — drives dashboard risk score",
    )

    # ------------------------------------------------------------------
    # Pipeline link
    # ------------------------------------------------------------------
    hunting_job_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("hunting_jobs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Job that clustered the IoCs and created this threat entity",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    hunting_job: Mapped["HuntingJob"] = relationship(  # noqa: F821
        "HuntingJob", back_populates="threats", lazy="joined"
    )
    # IoCs attributed to this threat — the core of the intel grouping
    iocs: Mapped[list["IoC"]] = relationship(  # noqa: F821
        "IoC", secondary=threat_iocs, back_populates="threats", lazy="selectin"
    )
    # Alerts that are linked to this threat
    alerts: Mapped[list["Alert"]] = relationship(  # noqa: F821
        "Alert", back_populates="threat", lazy="noload"
    )
