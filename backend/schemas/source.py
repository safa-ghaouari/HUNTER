from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.models.enums import SourceType


class SourceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    type: SourceType
    url: str | None = Field(default=None, max_length=4000)
    client_id: UUID | None = None
    polling_interval_minutes: int = Field(default=60, ge=1, le=10080)
    is_active: bool = True
    api_key: str | None = Field(default=None, min_length=1, max_length=4096)


class SourceUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    url: str | None = Field(default=None, max_length=4000)
    client_id: UUID | None = None
    polling_interval_minutes: int | None = Field(default=None, ge=1, le=10080)
    is_active: bool | None = None
    api_key: str | None = Field(default=None, min_length=1, max_length=4096)


class SourceResponse(BaseModel):
    id: UUID
    name: str
    type: SourceType
    url: str | None = None
    api_key_vault_path: str | None = None
    client_id: UUID | None = None
    is_active: bool
    polling_interval_minutes: int
    last_polled_at: datetime | None = None
    last_attempted_at: datetime | None = None
    last_failed_at: datetime | None = None
    consecutive_failures: int
    last_error_message: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
