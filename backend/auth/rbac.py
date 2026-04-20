from pathlib import Path
from uuid import UUID

import casbin
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.jwt import verify_token
from backend.db.database import get_db_session
from backend.models.user import User

_security = HTTPBearer(auto_error=False)
_auth_dir = Path(__file__).resolve().parent
_enforcer = casbin.Enforcer(
    str(_auth_dir / "model.conf"),
    str(_auth_dir / "policy.csv"),
)


def get_current_user_with_rbac(required_role: str):
    async def dependency(
        request: Request,
        credentials: HTTPAuthorizationCredentials | None = Depends(_security),
        session: AsyncSession = Depends(get_db_session),
    ) -> User:
        if credentials is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication credentials were not provided.",
            )

        payload = verify_token(credentials.credentials)
        role = payload["role"]
        if required_role and role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient role for this action.",
            )

        if not _enforcer.enforce(role, request.url.path, request.method.upper()):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="RBAC policy denied access to this resource.",
            )

        try:
            user_id = UUID(payload["sub"])
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token subject is invalid.",
            ) from exc

        statement = select(User).where(User.id == user_id, User.is_active.is_(True))
        user = (await session.execute(statement)).scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authenticated user no longer exists or is inactive.",
            )
        return user

    return dependency

