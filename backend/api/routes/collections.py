from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.rbac import get_current_user_with_rbac
from backend.db.database import get_db_session
from backend.models.enums import JobStatus, JobType
from backend.models.hunting_job import HuntingJob
from backend.models.source import Source
from backend.models.user import User
from backend.schemas.collection import CollectionRunCreateRequest, CollectionRunResponse
from backend.tasks.collection import run_hunting_job_task

router = APIRouter(prefix="/admin/collections", tags=["collections"])


async def _get_collection_job_or_404(job_id: UUID, session: AsyncSession) -> HuntingJob:
    statement = select(HuntingJob).where(HuntingJob.id == job_id, HuntingJob.type == JobType.COLLECTION)
    job = (await session.execute(statement)).scalar_one_or_none()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collection job not found.",
        )
    return job


async def _ensure_source_exists(source_id: UUID, session: AsyncSession) -> None:
    statement = select(Source.id).where(Source.id == source_id, Source.is_active.is_(True))
    existing_source_id = (await session.execute(statement)).scalar_one_or_none()
    if existing_source_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source not found or inactive.",
        )


@router.get("", response_model=list[CollectionRunResponse], status_code=status.HTTP_200_OK)
async def list_collection_runs(
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> list[CollectionRunResponse]:
    statement = (
        select(HuntingJob)
        .where(HuntingJob.type == JobType.COLLECTION)
        .order_by(HuntingJob.created_at.desc())
    )
    jobs = (await session.execute(statement)).scalars().all()
    return [CollectionRunResponse.model_validate(job) for job in jobs]


@router.post("", response_model=CollectionRunResponse, status_code=status.HTTP_201_CREATED)
async def create_collection_run(
    payload: CollectionRunCreateRequest,
    current_user: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> CollectionRunResponse:
    if payload.source_id is not None:
        await _ensure_source_exists(payload.source_id, session)

    params = dict(payload.params)
    if payload.seed_text:
        params["seed_text"] = payload.seed_text
    if payload.source_id is not None:
        params["source_id"] = str(payload.source_id)

    job = HuntingJob(
        type=JobType.COLLECTION,
        status=JobStatus.PENDING,
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
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to dispatch the collection job to the Celery worker.",
        ) from exc

    job.celery_task_id = task.id
    await session.commit()
    await session.refresh(job)
    return CollectionRunResponse.model_validate(job)


@router.get("/{job_id}", response_model=CollectionRunResponse, status_code=status.HTTP_200_OK)
async def get_collection_run(
    job_id: UUID,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> CollectionRunResponse:
    job = await _get_collection_job_or_404(job_id, session)
    return CollectionRunResponse.model_validate(job)
