from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=256)


class TokenRefreshRequest(BaseModel):
    token: str = Field(min_length=1)


class UserContextResponse(BaseModel):
    id: UUID
    email: str
    role: str
    client_id: UUID | None = None
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"]
    role: str
    user: UserContextResponse

