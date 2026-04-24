from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import select

from backend.models.enums import JobStatus, JobType, SourceType
from backend.models.hunting_job import HuntingJob
from backend.models.source import Source
from backend.services.collection_scheduler import dispatch_due_collection_jobs
from backend.services.hunting_runner import _resolve_entries

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def _session_context(session):
    yield session


class TestCollectionScheduler:
    async def test_dispatch_queues_initial_source_once(self, db_session, admin_user):
        source = Source(
            name="Seed Feed",
            type=SourceType.RSS,
            url="https://example.com/feed.xml",
            is_active=True,
            polling_interval_minutes=60,
        )
        db_session.add(source)
        await db_session.commit()

        task_result = MagicMock(id="scheduled-task-1")
        with (
            patch("backend.services.collection_scheduler.AsyncSessionLocal", return_value=_session_context(db_session)),
            patch("backend.tasks.collection.run_hunting_job_task.delay", return_value=task_result),
        ):
            summary = await dispatch_due_collection_jobs()

        assert summary["queued_jobs"] == 1

        jobs = (await db_session.execute(select(HuntingJob))).scalars().all()
        assert len(jobs) == 1
        assert jobs[0].type == JobType.COLLECTION
        assert jobs[0].status == JobStatus.PENDING

        await db_session.refresh(source)
        assert source.last_attempted_at is not None

    async def test_dispatch_respects_failure_backoff(self, db_session, admin_user):
        source = Source(
            name="Failing Feed",
            type=SourceType.RSS,
            url="https://example.com/feed.xml",
            is_active=True,
            polling_interval_minutes=60,
            last_attempted_at=datetime.now(timezone.utc) - timedelta(minutes=120),
            consecutive_failures=3,
        )
        db_session.add(source)
        await db_session.commit()

        with (
            patch("backend.services.collection_scheduler.AsyncSessionLocal", return_value=_session_context(db_session)),
            patch("backend.tasks.collection.run_hunting_job_task.delay", return_value=MagicMock(id="scheduled-task-2")),
        ):
            summary = await dispatch_due_collection_jobs()

        assert summary["queued_jobs"] == 0
        jobs = (await db_session.execute(select(HuntingJob))).scalars().all()
        assert jobs == []


class TestSourceFailureTracking:
    async def test_resolve_entries_auto_disables_source_after_repeated_failures(self, db_session):
        source = Source(
            name="Broken Abuse.ch",
            type=SourceType.ABUSE_CH,
            url="https://urlhaus-api.abuse.ch/v2/files/exports/{auth_key}/recent.csv",
            is_active=True,
            polling_interval_minutes=120,
            consecutive_failures=4,
            api_key_vault_path="secret/sources/broken-abuse-ch",
        )
        db_session.add(source)
        await db_session.commit()

        job = SimpleNamespace(source_id=source.id, params={})

        def _boom(_: Source):
            raise RuntimeError("Abuse.ch URLhaus Auth-Key missing")

        with patch("backend.services.hunting_runner.collect_source_entries", side_effect=_boom):
            entries, notes = await _resolve_entries(job, db_session)

        await db_session.refresh(source)

        assert entries == []
        assert any("auto-disabled" in note for note in notes)
        assert source.is_active is False
        assert source.consecutive_failures == 5
        assert source.last_failed_at is not None
        assert "Auth-Key missing" in (source.last_error_message or "")
