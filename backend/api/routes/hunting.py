from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.rbac import get_current_user_with_rbac
from backend.db.database import get_db_session
from backend.models.client import Client
from backend.models.enums import JobStatus, JobType
from backend.models.hunting_job import HuntingJob
from backend.models.source import Source
from backend.models.user import User
from backend.schemas.hunting import HuntingJobCreateRequest, HuntingJobResponse
from backend.tasks.collection import run_hunting_job_task

router = APIRouter(prefix="/admin/hunting", tags=["hunting"])


async def _get_hunting_job_or_404(job_id: UUID, session: AsyncSession) -> HuntingJob:
    statement = select(HuntingJob).where(HuntingJob.id == job_id)
    job = (await session.execute(statement)).scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hunting job not found.",
        )
    return job


async def _ensure_client_exists(client_id: UUID, session: AsyncSession) -> None:
    statement = select(Client.id).where(Client.id == client_id, Client.is_active.is_(True))
    existing_client_id = (await session.execute(statement)).scalar_one_or_none()
    if existing_client_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or inactive.",
        )


async def _ensure_source_exists(source_id: UUID, session: AsyncSession) -> None:
    statement = select(Source.id).where(Source.id == source_id, Source.is_active.is_(True))
    existing_source_id = (await session.execute(statement)).scalar_one_or_none()
    if existing_source_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found or inactive.",
        )


def _build_job_params(payload: HuntingJobCreateRequest) -> dict:
    params = dict(payload.params)
    if payload.theme:
        params["theme"] = payload.theme
    if payload.period_days is not None:
        params["period_days"] = payload.period_days
    if payload.seed_text:
        params["seed_text"] = payload.seed_text
    if payload.client_id is not None:
        params.setdefault("client_id", str(payload.client_id))
    if payload.source_id is not None:
        params.setdefault("source_id", str(payload.source_id))
    return params


@router.get("", response_model=list[HuntingJobResponse], status_code=status.HTTP_200_OK)
async def list_hunting_jobs(
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
    status_filter: JobStatus | None = Query(default=None, alias="status"),
    job_type: JobType | None = Query(default=None, alias="type"),
    client_id: UUID | None = None,
) -> list[HuntingJobResponse]:
    statement = select(HuntingJob)

    if status_filter is not None:
        statement = statement.where(HuntingJob.status == status_filter)
    if job_type is not None:
        statement = statement.where(HuntingJob.type == job_type)
    if client_id is not None:
        statement = statement.where(HuntingJob.client_id == client_id)

    statement = statement.order_by(HuntingJob.created_at.desc())
    jobs = (await session.execute(statement)).scalars().all()
    return [HuntingJobResponse.model_validate(job) for job in jobs]


@router.post("", response_model=HuntingJobResponse, status_code=status.HTTP_201_CREATED)
async def create_hunting_job(
    payload: HuntingJobCreateRequest,
    current_user: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> HuntingJobResponse:
    if payload.client_id is not None:
        await _ensure_client_exists(payload.client_id, session)
    if payload.source_id is not None:
        await _ensure_source_exists(payload.source_id, session)

    params = _build_job_params(payload)
    job = HuntingJob(
        type=payload.type,
        status=JobStatus.PENDING,
        client_id=payload.client_id,
        source_id=payload.source_id,
        initiated_by=current_user.id,
        params=params,
    )

    session.add(job)
    await session.commit()
    await session.refresh(job)

    try:
        task = run_hunting_job_task.delay(str(job.id))
    except Exception as exc:
        job.status = JobStatus.FAILED
        job.error_message = f"Failed to dispatch Celery task: {exc}"
        job.finished_at = datetime.now(timezone.utc)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to dispatch the hunting job to the Celery worker.",
        ) from exc

    job.celery_task_id = task.id
    await session.commit()
    await session.refresh(job)
    return HuntingJobResponse.model_validate(job)


@router.get("/{job_id}", response_model=HuntingJobResponse, status_code=status.HTTP_200_OK)
async def get_hunting_job(
    job_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> HuntingJobResponse:
    job = await _get_hunting_job_or_404(job_id, session)
    return HuntingJobResponse.model_validate(job)


@router.patch("/{job_id}", response_model=HuntingJobResponse, status_code=status.HTTP_200_OK)
async def cancel_hunting_job(
    job_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> HuntingJobResponse:
    job = await _get_hunting_job_or_404(job_id, session)
    if job.status not in (JobStatus.PENDING, JobStatus.RUNNING):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cancel a job with status '{job.status.value}'.",
        )
    job.status = JobStatus.CANCELLED
    job.finished_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(job)
    return HuntingJobResponse.model_validate(job)
