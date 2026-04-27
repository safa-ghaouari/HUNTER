from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from backend.models.enums import ReportStatus, ReportType


class ReportResponse(BaseModel):
    id: UUID
    client_id: UUID
    hunting_job_id: UUID | None = None
    generated_by: UUID
    report_type: ReportType
    title: str
    period_start: date | None = None
    period_end: date | None = None
    status: ReportStatus
    minio_object_key: str | None = None
    file_size_bytes: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReportDownloadResponse(BaseModel):
    download_url: str
