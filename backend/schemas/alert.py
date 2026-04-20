from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from backend.models.enums import AlertStatus, Severity


class AlertResponse(BaseModel):
    id: UUID
    client_id: UUID
    hunting_job_id: UUID | None = None
    asset_id: UUID | None = None
    threat_id: UUID | None = None
    severity: Severity
    status: AlertStatus
    title: str
    description: str | None = None
    raw_log_ref: str | None = None
    mitre_technique_id: str | None = None
    thehive_case_id: str | None = None
    validated_by: UUID | None = None
    validated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
