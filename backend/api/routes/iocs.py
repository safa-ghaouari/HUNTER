from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from backend.auth.rbac import get_current_user_with_rbac
from backend.db.database import get_db_session
from backend.integrations.enrichment_client import enrich_ioc
from backend.models.enums import IocType, Severity, TlpLevel
from backend.models.ioc import IoC
from backend.models.user import User

router = APIRouter(tags=["iocs"])


class IoCResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: IocType
    value: str
    value_normalized: str
    severity: Severity
    confidence: int
    tlp: TlpLevel
    source_type: str
    description: str | None = None
    is_active: bool
    enrichment: dict | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    created_at: datetime
    hunting_job_id: UUID | None = None


class IoCEnrichResponse(BaseModel):
    ioc_id: UUID
    enrichment: dict


async def _get_ioc_or_404(ioc_id: UUID, session: AsyncSession) -> IoC:
    ioc = (await session.execute(select(IoC).where(IoC.id == ioc_id))).scalar_one_or_none()
    if ioc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="IoC not found.")
    return ioc


@router.get("/admin/iocs", response_model=list[IoCResponse], status_code=status.HTTP_200_OK)
async def list_iocs(
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
    ioc_type: IocType | None = Query(default=None, alias="type"),
    severity: Severity | None = None,
    is_active: bool | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
) -> list[IoCResponse]:
    stmt = select(IoC)
    if ioc_type is not None:
        stmt = stmt.where(IoC.type == ioc_type)
    if severity is not None:
        stmt = stmt.where(IoC.severity == severity)
    if is_active is not None:
        stmt = stmt.where(IoC.is_active == is_active)
    stmt = stmt.order_by(IoC.created_at.desc()).limit(limit).offset(offset)
    iocs = (await session.execute(stmt)).scalars().all()
    return [IoCResponse.model_validate(ioc) for ioc in iocs]


@router.get("/admin/iocs/{ioc_id}", response_model=IoCResponse, status_code=status.HTTP_200_OK)
async def get_ioc(
    ioc_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> IoCResponse:
    ioc = await _get_ioc_or_404(ioc_id, session)
    return IoCResponse.model_validate(ioc)


@router.post(
    "/admin/iocs/{ioc_id}/enrich",
    response_model=IoCEnrichResponse,
    status_code=status.HTTP_200_OK,
)
async def enrich_ioc_endpoint(
    ioc_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> IoCEnrichResponse:
    ioc = await _get_ioc_or_404(ioc_id, session)
    enrichment = enrich_ioc(ioc.type, ioc.value_normalized)
    ioc.enrichment = enrichment
    flag_modified(ioc, "enrichment")
    await session.commit()
    return IoCEnrichResponse(ioc_id=ioc_id, enrichment=enrichment)
