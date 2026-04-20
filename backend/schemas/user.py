from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.models.user import UserRole


class ClientUserCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=256)
    is_active: bool = True


class ClientUserResponse(BaseModel):
    id: UUID
    email: str
    role: UserRole
    client_id: UUID | None = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
