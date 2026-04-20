import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from backend.models.base import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    vpn_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    api_key_vault_path: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Client environment connectivity
    connection_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    openvas_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    secureworks_url: Mapped[str | None] = mapped_column(String(512), nullable=True)

    # one-to-many back-references (lazy=noload — load explicitly when needed)
    users: Mapped[list["User"]] = relationship(  # noqa: F821
        "User", back_populates="client", lazy="selectin"
    )
    assets: Mapped[list["Asset"]] = relationship(  # noqa: F821
        "Asset", back_populates="client", lazy="noload"
    )
    alerts: Mapped[list["Alert"]] = relationship(  # noqa: F821
        "Alert", back_populates="client", lazy="noload"
    )
    reports: Mapped[list["Report"]] = relationship(  # noqa: F821
        "Report", back_populates="client", lazy="noload"
    )
