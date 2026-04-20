from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.models.enums import JobStatus


class CollectionRunCreateRequest(BaseModel):
    source_id: UUID | None = None
    seed_text: str | None = Field(default=None, min_length=1, max_length=20000)
    params: dict[str, Any] = Field(default_factory=dict)


class CollectionRunResponse(BaseModel):
    id: UUID
    celery_task_id: str | None = None
    status: JobStatus
    source_id: UUID | None = None
    initiated_by: UUID
    params: dict[str, Any]
    result_summary: dict[str, Any] | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
