from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.models.enums import ConnectionType


class ClientCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    vpn_ip: str | None = Field(default=None, max_length=64)
    api_key: str = Field(min_length=1, max_length=1024)
    connection_type: ConnectionType | None = None
    openvas_url: str | None = Field(default=None, max_length=512)
    secureworks_url: str | None = Field(default=None, max_length=512)
    openvas_username: str | None = Field(default=None, max_length=255)
    openvas_password: str | None = Field(default=None, max_length=1024)
    secureworks_client_id: str | None = Field(default=None, max_length=255)
    secureworks_client_secret: str | None = Field(default=None, max_length=1024)


class ClientUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    vpn_ip: str | None = Field(default=None, max_length=64)
    connection_type: ConnectionType | None = None
    openvas_url: str | None = Field(default=None, max_length=512)
    secureworks_url: str | None = Field(default=None, max_length=512)
    openvas_username: str | None = Field(default=None, max_length=255)
    openvas_password: str | None = Field(default=None, max_length=1024)
    secureworks_client_id: str | None = Field(default=None, max_length=255)
    secureworks_client_secret: str | None = Field(default=None, max_length=1024)


class ClientResponse(BaseModel):
    id: UUID
    name: str
    vpn_ip: str | None = None
    api_key_vault_path: str
    is_active: bool
    created_at: datetime
    connection_type: ConnectionType | None = None
    openvas_url: str | None = None
    secureworks_url: str | None = None

    model_config = ConfigDict(from_attributes=True)
