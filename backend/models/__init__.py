"""Model registry — import order matters for SQLAlchemy mapper configuration.

Rules:
  1. Base first (no dependencies).
  2. Enums and association tables before the models that reference them.
  3. Models with no FK dependencies before models that reference them.
  4. All models must be imported here so that Base.metadata is complete
     when Alembic generates / runs migrations.
"""

# Core
from backend.models.base import Base

# Shared enumerations (Python-side; map to PostgreSQL ENUMs in the migration)
from backend.models.enums import (
    AlertStatus,
    AssetCriticality,
    AssetType,
    IocType,
    JobStatus,
    JobType,
    ReportStatus,
    ReportType,
    Severity,
    SourceType,
    ThreatType,
    TlpLevel,
)

# Association tables (must be registered with Base.metadata before the
# ORM classes that reference them via `secondary=`)
from backend.models.associations import alert_iocs, ioc_tags, threat_iocs

# ── Group 1: Identity & Access ─────────────────────────────────────────────
from backend.models.client import Client
from backend.models.user import User, UserRole

# ── Group 2: Pipeline (no FK to IoC / Alert yet) ──────────────────────────
from backend.models.source import Source
from backend.models.hunting_job import HuntingJob

# ── Group 3: Threat Intelligence ──────────────────────────────────────────
from backend.models.tag import Tag
from backend.models.ioc import IoC
from backend.models.threat import Threat

# ── Group 4: Client Environment ───────────────────────────────────────────
from backend.models.asset import Asset

# ── Group 5: Correlation & Detection ──────────────────────────────────────
from backend.models.alert import Alert

# ── Group 6: Reporting ────────────────────────────────────────────────────
from backend.models.report import Report

__all__ = [
    # Base
    "Base",
    # Enums
    "AlertStatus",
    "AssetCriticality",
    "AssetType",
    "IocType",
    "JobStatus",
    "JobType",
    "ReportStatus",
    "ReportType",
    "Severity",
    "SourceType",
    "ThreatType",
    "TlpLevel",
    "UserRole",
    # Association tables
    "alert_iocs",
    "ioc_tags",
    "threat_iocs",
    # Models
    "Alert",
    "Asset",
    "Client",
    "HuntingJob",
    "IoC",
    "Report",
    "Source",
    "Tag",
    "Threat",
    "User",
]
