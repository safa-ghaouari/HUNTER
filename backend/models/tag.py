"""Tag model — analyst-defined labels for IoCs.

Tags are free-form labels that SOC analysts attach to IoCs to organise
their intel:  e.g. "ransomware", "apt29", "phishing-kit", "russia".

A tag has a colour so the frontend can render coloured badges (consistent
with the Badge component's `type` variant).

Relationship: Tag ↔ IoC is many-to-many via the `ioc_tags` association table.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from backend.models.associations import ioc_tags
from backend.models.base import Base


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(
        String(100), nullable=False, unique=True, index=True,
        comment="Unique label used as the badge text (lowercase, slug-style recommended)",
    )
    color: Mapped[str] = mapped_column(
        String(7), nullable=False, default="#00D9FF",
        comment="Hex colour code for the badge — defaults to HUNTER cyan #00D9FF",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # ------------------------------------------------------------------
    # Relationships
    # ------------------------------------------------------------------
    # Lazy noload: tag → iocs is a potentially large collection.
    # Use explicit join when needed (e.g. "show all IoCs for this tag").
    iocs: Mapped[list["IoC"]] = relationship(  # noqa: F821
        "IoC", secondary=ioc_tags, back_populates="tags", lazy="noload"
    )
