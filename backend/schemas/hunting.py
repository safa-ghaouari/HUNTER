from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.models.enums import JobStatus, JobType


class HuntingJobCreateRequest(BaseModel):
    type: JobType = JobType.FULL_HUNT
    client_id: UUID | None = None
    source_id: UUID | None = None
    theme: str | None = Field(default=None, min_length=1, max_length=255)
    period_days: int | None = Field(default=None, ge=1, le=365)
    seed_text: str | None = Field(default=None, min_length=1, max_length=20000)
    params: dict[str, Any] = Field(default_factory=dict)


class HuntingJobResponse(BaseModel):
    id: UUID
    celery_task_id: str | None = None
    type: JobType
    status: JobStatus
    client_id: UUID | None = None
    source_id: UUID | None = None
    initiated_by: UUID
    params: dict[str, Any]
    result_summary: dict[str, Any] | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
