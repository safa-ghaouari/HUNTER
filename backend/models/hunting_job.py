"""HuntingJob model — Pipeline orchestration tracker.

Every async operation in the HUNTER pipeline is represented as a HuntingJob.
The SOC Admin triggers a job via the API; FastAPI dispatches a Celery task and
stores the task ID here so the frontend can poll (or receive WebSocket pushes)
for progress.

Job lifecycle:
  PENDING → RUNNING → SUCCESS | FAILED | CANCELLED

Job types map to Celery task chains:
  full_hunt  : collection → nlp → correlation → report_gen  (end-to-end)
  collection : Feedparser RSS + Newspaper3k + MISP import only
  nlp        : spaCy NER + iocextract + SecBERT + sklearn clustering
  correlation: MISP IoC ↔ Elasticsearch client-logs matching
  report_gen : WeasyPrint PDF generation → MinIO upload

The `params` JSONB column carries job-specific input:
  { "theme": "ransomware", "client_id": "...", "period_days": 7, "sources": [...] }

The `result_summary` JSONB column is populated on SUCCESS:
  { "iocs_extracted": 142, "alerts_created": 8, "report_id": "..." }
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from backend.models.base import Base
from backend.models.enums import JobStatus, JobType


class HuntingJob(Base):
    __tablename__ = "hunting_jobs"

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------
    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    celery_task_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True, index=True,
        comment="Celery async_result task ID — used to track/revoke the worker task",
    )

    # ------------------------------------------------------------------
    # Classification
    # ------------------------------------------------------------------
    type: Mapped[JobType] = mapped_column(
        SqlEnum(JobType, name="job_type_enum"),
        nullable=False,
        comment="Determines which Celery task chain is executed",
    )
    status: Mapped[JobStatus] = mapped_column(
        SqlEnum(JobStatus, name="job_status_enum"),
        nullable=False,
        default=JobStatus.PENDING,
        comment="Current lifecycle state — updated by the Celery task on transitions",
    )

    # ------------------------------------------------------------------
    # Ownership & scope
    # ------------------------------------------------------------------
    # client_id is null for global hunts (not scoped to one client).
    # For correlation jobs it is always set (we correlate IoCs against
    # a specific client's Elasticsearch index).
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("clients.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Target client environment — null means platform-wide (admin hunt)",
    )
    # source_id is set for collection jobs targeting one specific source.
    # Null for full_hunt (all active sources are iterated by the task).
    source_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("sources.id", ondelete="SET NULL"),
        nullable=True,
        comment="Specific source targeted by a collection job — null for full_hunt",
    )
    initiated_by: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        comment="SOC analyst who triggered this job",
    )

    # ------------------------------------------------------------------
    # Payload
    # ------------------------------------------------------------------
    params: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict,
        comment=(
            "Input parameters passed to the Celery task. "
            "Keys vary by job type: theme, period_days, source_ids, client_id…"
        ),
    )
    result_summary: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True,
        comment=(
            "Output statistics written by the task on SUCCESS. "
            "e.g. { iocs_extracted, alerts_created, report_id }"
        ),
    )
    error_message: Mapped[str | None] = mapped_column(
        Text, nullable=True,
        comment="Full traceback or human-readable error written on FAILED status",
    )

    # ------------------------------------------------------------------
    # Timing
    # ------------------------------------------------------------------
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="When the Celery worker actually started processing",
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
        comment="When the task reached a terminal state (SUCCESS / FAILED / CANCELLED)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    client: Mapped["Client"] = relationship(  # noqa: F821
        "Client", foreign_keys=[client_id], lazy="joined"
    )
    source: Mapped["Source"] = relationship(  # noqa: F821
        "Source", back_populates="hunting_jobs", lazy="joined"
    )
    initiated_by_user: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[initiated_by], lazy="joined"
    )
    iocs: Mapped[list["IoC"]] = relationship(  # noqa: F821
        "IoC", back_populates="hunting_job", lazy="noload"
    )
    threats: Mapped[list["Threat"]] = relationship(  # noqa: F821
        "Threat", back_populates="hunting_job", lazy="noload"
    )
    alerts: Mapped[list["Alert"]] = relationship(  # noqa: F821
        "Alert", back_populates="hunting_job", lazy="noload"
    )
    reports: Mapped[list["Report"]] = relationship(  # noqa: F821
        "Report", back_populates="hunting_job", lazy="noload"
    )
