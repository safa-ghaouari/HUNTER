from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.rbac import get_current_user_with_rbac
from backend.config import settings
from backend.db.database import get_db_session
from backend.models.enums import ReportStatus, ReportType
from backend.models.report import Report
from backend.models.user import User
from backend.schemas.report import ReportDownloadResponse, ReportResponse
from backend.storage.minio_client import get_presigned_url

router = APIRouter(tags=["reports"])


async def _get_report_or_404(report_id: UUID, session: AsyncSession) -> Report:
    statement = select(Report).where(Report.id == report_id)
    report = (await session.execute(statement)).scalar_one_or_none()
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )
    return report


def _ensure_client_scope(user: User) -> UUID:
    if user.client_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Authenticated client user is not linked to a client scope.",
        )
    return user.client_id


def _build_download_response(report: Report) -> ReportDownloadResponse:
    if report.status != ReportStatus.READY or not report.minio_object_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Report file is not ready for download.",
        )

    download_url = get_presigned_url(
        bucket=settings.minio_bucket,
        name=report.minio_object_key,
        expires=timedelta(hours=1),
    )
    return ReportDownloadResponse(download_url=download_url)


@router.get("/admin/reports", response_model=list[ReportResponse], status_code=status.HTTP_200_OK)
async def list_admin_reports(
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
    client_id: UUID | None = None,
    status_filter: ReportStatus | None = Query(default=None, alias="status"),
    report_type: ReportType | None = Query(default=None, alias="type"),
) -> list[ReportResponse]:
    statement = select(Report)

    if client_id is not None:
        statement = statement.where(Report.client_id == client_id)
    if status_filter is not None:
        statement = statement.where(Report.status == status_filter)
    if report_type is not None:
        statement = statement.where(Report.report_type == report_type)

    statement = statement.order_by(Report.created_at.desc())
    reports = (await session.execute(statement)).scalars().all()
    return [ReportResponse.model_validate(report) for report in reports]


@router.get("/admin/reports/{report_id}", response_model=ReportResponse, status_code=status.HTTP_200_OK)
async def get_admin_report(
    report_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ReportResponse:
    report = await _get_report_or_404(report_id, session)
    return ReportResponse.model_validate(report)


@router.get(
    "/admin/reports/{report_id}/download",
    response_model=ReportDownloadResponse,
    status_code=status.HTTP_200_OK,
)
async def get_admin_report_download(
    report_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ReportDownloadResponse:
    report = await _get_report_or_404(report_id, session)
    return _build_download_response(report)


@router.get("/client/reports", response_model=list[ReportResponse], status_code=status.HTTP_200_OK)
async def list_client_reports(
    current_user: User = Depends(get_current_user_with_rbac("client")),
    session: AsyncSession = Depends(get_db_session),
    status_filter: ReportStatus | None = Query(default=None, alias="status"),
    report_type: ReportType | None = Query(default=None, alias="type"),
) -> list[ReportResponse]:
    scoped_client_id = _ensure_client_scope(current_user)
    statement = select(Report).where(Report.client_id == scoped_client_id)

    if status_filter is not None:
        statement = statement.where(Report.status == status_filter)
    if report_type is not None:
        statement = statement.where(Report.report_type == report_type)

    statement = statement.order_by(Report.created_at.desc())
    reports = (await session.execute(statement)).scalars().all()
    return [ReportResponse.model_validate(report) for report in reports]


@router.get("/client/reports/{report_id}", response_model=ReportResponse, status_code=status.HTTP_200_OK)
async def get_client_report(
    report_id: UUID,
    current_user: User = Depends(get_current_user_with_rbac("client")),
    session: AsyncSession = Depends(get_db_session),
) -> ReportResponse:
    scoped_client_id = _ensure_client_scope(current_user)
    report = await _get_report_or_404(report_id, session)
    if report.client_id != scoped_client_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )
    return ReportResponse.model_validate(report)


@router.get(
    "/client/reports/{report_id}/download",
    response_model=ReportDownloadResponse,
    status_code=status.HTTP_200_OK,
)
async def get_client_report_download(
    report_id: UUID,
    current_user: User = Depends(get_current_user_with_rbac("client")),
    session: AsyncSession = Depends(get_db_session),
) -> ReportDownloadResponse:
    scoped_client_id = _ensure_client_scope(current_user)
    report = await _get_report_or_404(report_id, session)
    if report.client_id != scoped_client_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Report not found.",
        )
    return _build_download_response(report)
