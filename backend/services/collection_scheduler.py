from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from backend.db.database import AsyncSessionLocal
from backend.models.enums import JobStatus, JobType
from backend.models.hunting_job import HuntingJob
from backend.models.source import Source
from backend.models.user import User, UserRole

_MAX_FAILURE_BACKOFF_MULTIPLIER = 16


def _source_due_at(source: Source) -> datetime | None:
    reference_time = source.last_attempted_at or source.last_polled_at
    if reference_time is None:
        return None

    failure_multiplier = 1
    if source.consecutive_failures > 1:
        failure_multiplier = min(
            2 ** (source.consecutive_failures - 1),
            _MAX_FAILURE_BACKOFF_MULTIPLIER,
        )

    return reference_time + timedelta(
        minutes=source.polling_interval_minutes * failure_multiplier
    )


async def dispatch_due_collection_jobs() -> dict[str, object]:
    from backend.tasks.collection import run_hunting_job_task

    async with AsyncSessionLocal() as session:
        admin_user = (
            await session.execute(
                select(User)
                .where(User.role == UserRole.ADMIN_SOC, User.is_active.is_(True))
                .order_by(User.created_at.asc())
            )
        ).scalars().first()
        if admin_user is None:
            return {
                "checked_sources": 0,
                "queued_jobs": 0,
                "job_ids": [],
                "notes": ["no active SOC admin user is available to own scheduled collection jobs"],
            }

        sources = (
            await session.execute(
                select(Source)
                .where(Source.is_active.is_(True))
                .order_by(Source.created_at.asc())
            )
        ).scalars().all()

        now = datetime.now(timezone.utc)
        queued_job_ids: list[str] = []
        notes: list[str] = []

        for source in sources:
            due_at = _source_due_at(source)
            if due_at is not None:
                if due_at > now:
                    continue

            existing_job_id = (
                await session.execute(
                    select(HuntingJob.id)
                    .where(
                        HuntingJob.type == JobType.COLLECTION,
                        HuntingJob.source_id == source.id,
                        HuntingJob.status.in_([JobStatus.PENDING, JobStatus.RUNNING]),
                    )
                    .limit(1)
                )
            ).scalar_one_or_none()
            if existing_job_id is not None:
                notes.append(f"source '{source.name}' already has an active collection job")
                continue

            source.last_attempted_at = now
            job = HuntingJob(
                type=JobType.COLLECTION,
                status=JobStatus.PENDING,
                source_id=source.id,
                initiated_by=admin_user.id,
                params={
                    "source_id": str(source.id),
                    "trigger": "scheduler",
                },
            )
            session.add(job)
            await session.flush()

            try:
                task = run_hunting_job_task.delay(str(job.id))
            except Exception as exc:
                job.status = JobStatus.FAILED
                job.error_message = f"Failed to dispatch scheduled collection job: {exc}"
                notes.append(f"source '{source.name}' dispatch failed: {exc}")
                continue

            job.celery_task_id = task.id
            queued_job_ids.append(str(job.id))
            if due_at is None:
                notes.append(f"queued initial collection job for source '{source.name}'")
            else:
                notes.append(f"queued scheduled collection job for source '{source.name}'")

        await session.commit()
        return {
            "checked_sources": len(sources),
            "queued_jobs": len(queued_job_ids),
            "job_ids": queued_job_ids,
            "notes": notes,
        }
