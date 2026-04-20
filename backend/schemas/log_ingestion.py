from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from backend.models.enums import AssetType


class ClientLogEntry(BaseModel):
    timestamp: datetime | None = None
    message: str = Field(min_length=1, max_length=20000)
    hostname: str | None = Field(default=None, min_length=1, max_length=255)
    ip_address: str | None = Field(default=None, min_length=1, max_length=64)
    source: str | None = Field(default=None, min_length=1, max_length=255)
    event_type: str | None = Field(default=None, min_length=1, max_length=255)
    asset_type: AssetType | None = None
    os: str | None = Field(default=None, min_length=1, max_length=255)
    external_id: str | None = Field(default=None, min_length=1, max_length=255)
    raw_event: dict[str, Any] | None = None


class ClientLogIngestRequest(BaseModel):
    logs: list[ClientLogEntry] = Field(min_length=1, max_length=500)


class ClientLogIngestResponse(BaseModel):
    client_id: UUID
    index_name: str
    ingested_count: int


class ClientLogCollectionRequest(BaseModel):
    source_id: UUID | None = None
    limit: int = Field(default=200, ge=1, le=500)


class ClientLogCollectionResponse(BaseModel):
    client_id: UUID
    index_name: str
    ingested_count: int
    source_ids: list[UUID] = Field(default_factory=list)
    sources_processed: int
    notes: list[str] = Field(default_factory=list)


class IndexedClientLogResponse(BaseModel):
    id: str
    timestamp: datetime | None = None
    message: str
    hostname: str | None = None
    ip_address: str | None = None
    source: str | None = None
    event_type: str | None = None
    indicator_values: list[str] = Field(default_factory=list)
