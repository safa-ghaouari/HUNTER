"""SQLAlchemy association tables for many-to-many relationships.

Defined centrally to avoid circular imports between model modules.
All three tables are part of Base.metadata so Alembic picks them up
automatically when models/__init__.py is imported.
"""

from sqlalchemy import Column, ForeignKey, Table
from sqlalchemy.types import Uuid

from backend.models.base import Base

# ---------------------------------------------------------------------------
# IoC ↔ Tag
# An IoC can carry multiple analyst-defined tags (malware-family, campaign…).
# A tag can label many IoCs.
# ---------------------------------------------------------------------------
ioc_tags = Table(
    "ioc_tags",
    Base.metadata,
    Column(
        "ioc_id",
        Uuid(as_uuid=True),
        ForeignKey("iocs.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "tag_id",
        Uuid(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# ---------------------------------------------------------------------------
# Threat ↔ IoC
# A threat (malware family, actor, campaign) is characterised by many IoCs.
# An IoC can be attributed to several threats (overlap between actors is common).
# ---------------------------------------------------------------------------
threat_iocs = Table(
    "threat_iocs",
    Base.metadata,
    Column(
        "threat_id",
        Uuid(as_uuid=True),
        ForeignKey("threats.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "ioc_id",
        Uuid(as_uuid=True),
        ForeignKey("iocs.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

# ---------------------------------------------------------------------------
# Alert ↔ IoC
# A correlation alert is triggered by one or more IoCs matching client logs.
# Storing which specific IoCs fired the alert is essential for analyst triage.
# ---------------------------------------------------------------------------
alert_iocs = Table(
    "alert_iocs",
    Base.metadata,
    Column(
        "alert_id",
        Uuid(as_uuid=True),
        ForeignKey("alerts.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "ioc_id",
        Uuid(as_uuid=True),
        ForeignKey("iocs.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
