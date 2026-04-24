from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.rbac import get_current_user_with_rbac
from backend.db.database import get_db_session
from backend.models.alert import Alert
from backend.models.enums import AlertStatus, Severity
from backend.models.user import User
from backend.schemas.alert import AlertResponse


class AlertStatusUpdateRequest(BaseModel):
    status: AlertStatus

router = APIRouter(tags=["alerts"])


async def _get_alert_or_404(alert_id: UUID, session: AsyncSession) -> Alert:
    statement = select(Alert).where(Alert.id == alert_id)
    alert = (await session.execute(statement)).scalar_one_or_none()
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found.",
        )
    return alert


def _ensure_client_scope(user: User) -> UUID:
    if user.client_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated client user is not linked to a client scope.",
        )
    return user.client_id


@router.get("/admin/alerts", response_model=list[AlertResponse], status_code=status.HTTP_200_OK)
async def list_admin_alerts(
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
    client_id: UUID | None = None,
    status_filter: AlertStatus | None = Query(default=None, alias="status"),
    severity: Severity | None = None,
) -> list[AlertResponse]:
    statement = select(Alert)

    if client_id is not None:
        statement = statement.where(Alert.client_id == client_id)
    if status_filter is not None:
        statement = statement.where(Alert.status == status_filter)
    if severity is not None:
        statement = statement.where(Alert.severity == severity)

    statement = statement.order_by(Alert.created_at.desc())
    alerts = (await session.execute(statement)).scalars().all()
    return [AlertResponse.model_validate(alert) for alert in alerts]


@router.get("/admin/alerts/{alert_id}", response_model=AlertResponse, status_code=status.HTTP_200_OK)
async def get_admin_alert(
    alert_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> AlertResponse:
    alert = await _get_alert_or_404(alert_id, session)
    return AlertResponse.model_validate(alert)


@router.patch("/admin/alerts/{alert_id}", response_model=AlertResponse, status_code=status.HTTP_200_OK)
async def update_admin_alert_status(
    alert_id: UUID,
    payload: AlertStatusUpdateRequest,
    current_user: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> AlertResponse:
    alert = await _get_alert_or_404(alert_id, session)
    alert.status = payload.status
    if payload.status in (AlertStatus.RESOLVED, AlertStatus.FALSE_POSITIVE):
        alert.validated_by = current_user.id
        alert.validated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(alert)
    return AlertResponse.model_validate(alert)


@router.get("/client/alerts", response_model=list[AlertResponse], status_code=status.HTTP_200_OK)
async def list_client_alerts(
    current_user: User = Depends(get_current_user_with_rbac("client")),
    session: AsyncSession = Depends(get_db_session),
    status_filter: AlertStatus | None = Query(default=None, alias="status"),
    severity: Severity | None = None,
) -> list[AlertResponse]:
    scoped_client_id = _ensure_client_scope(current_user)
    statement = select(Alert).where(Alert.client_id == scoped_client_id)

    if status_filter is not None:
        statement = statement.where(Alert.status == status_filter)
    if severity is not None:
        statement = statement.where(Alert.severity == severity)

    statement = statement.order_by(Alert.created_at.desc())
    alerts = (await session.execute(statement)).scalars().all()
    return [AlertResponse.model_validate(alert) for alert in alerts]


@router.get("/client/alerts/{alert_id}", response_model=AlertResponse, status_code=status.HTTP_200_OK)
async def get_client_alert(
    alert_id: UUID,
    current_user: User = Depends(get_current_user_with_rbac("client")),
    session: AsyncSession = Depends(get_db_session),
) -> AlertResponse:
    scoped_client_id = _ensure_client_scope(current_user)
    alert = await _get_alert_or_404(alert_id, session)
    if alert.client_id != scoped_client_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found.",
        )
    return AlertResponse.model_validate(alert)
