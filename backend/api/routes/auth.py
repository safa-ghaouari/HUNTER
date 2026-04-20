from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.jwt import create_access_token, verify_token
from backend.auth.password import verify_password
from backend.db.database import get_db_session
from backend.models.user import User
from backend.schemas.auth import LoginRequest, TokenRefreshRequest, TokenResponse, UserContextResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def login(
    credentials: LoginRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    statement = select(User).where(
        User.email == credentials.email.lower(),
        User.is_active.is_(True),
    )
    user = (await session.execute(statement)).scalar_one_or_none()
    if user is None or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    access_token = create_access_token(user.id, user.role.value, user.client_id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=user.role.value,
        user=UserContextResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse, status_code=status.HTTP_200_OK)
async def refresh_token(
    payload: TokenRefreshRequest,
    session: AsyncSession = Depends(get_db_session),
) -> TokenResponse:
    token_payload = verify_token(payload.token)

    try:
        user_id = UUID(token_payload["sub"])
    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        ) from exc

    statement = select(User).where(User.id == user_id, User.is_active.is_(True))
    user = (await session.execute(statement)).scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive.",
        )

    access_token = create_access_token(user.id, user.role.value, user.client_id)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=user.role.value,
        user=UserContextResponse.model_validate(user),
    )

