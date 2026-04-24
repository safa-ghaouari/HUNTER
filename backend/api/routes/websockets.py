"""WebSocket endpoint — real-time job-status push.

Clients subscribe to a specific hunting job by connecting to:

    ws://<host>/ws/jobs/{job_id}
    ws://<host>/api/ws/jobs/{job_id}

On connect the server immediately sends the current job state, then pushes an
update every POLL_INTERVAL_SECONDS until the job reaches a terminal state
(success / failed / cancelled) or the client disconnects.

Message schema (JSON):
{
    "job_id":       "<uuid>",
    "status":       "pending" | "running" | "success" | "failed" | "cancelled",
    "type":         "collection" | "full_hunt" | ...,
    "started_at":   "<ISO-8601 or null>",
    "finished_at":  "<ISO-8601 or null>",
    "error_message": "<string or null>",
    "result_summary": { ... } | null
}
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from backend.auth.jwt import verify_token
from backend.db.database import AsyncSessionLocal
from backend.models.hunting_job import HuntingJob
from backend.models.user import User, UserRole

router = APIRouter()

_POLL_INTERVAL_SECONDS = 2
_TERMINAL_STATUSES = {"success", "failed", "cancelled"}


def _job_payload(job: HuntingJob) -> str:
    def _iso(dt: datetime | None) -> str | None:
        return dt.isoformat() if dt is not None else None

    return json.dumps(
        {
            "job_id": str(job.id),
            "status": job.status.value,
            "type": job.type.value,
            "started_at": _iso(job.started_at),
            "finished_at": _iso(job.finished_at),
            "error_message": job.error_message,
            "result_summary": job.result_summary,
        }
    )


async def _load_authenticated_user(websocket: WebSocket) -> User | None:
    token = websocket.query_params.get("token", "")
    try:
        payload = verify_token(token)
        user_id = UUID(str(payload["sub"]))
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
        return None

    async with AsyncSessionLocal() as session:
        statement = select(User).where(User.id == user_id, User.is_active.is_(True))
        user = (await session.execute(statement)).scalar_one_or_none()

    if user is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return None
    return user


def _user_can_access_job(user: User, job: HuntingJob) -> bool:
    if user.role == UserRole.ADMIN_SOC:
        return True
    if user.role != UserRole.CLIENT:
        return False
    if user.client_id is None or job.client_id is None:
        return False
    return user.client_id == job.client_id


@router.websocket("/ws/jobs/{job_id}")
async def job_status_ws(websocket: WebSocket, job_id: UUID) -> None:
    """Stream live status for a hunting job.

    Authentication: pass the JWT access token as a query parameter:
        ?token=<access_token>
    """
    user = await _load_authenticated_user(websocket)
    if user is None:
        return

    async with AsyncSessionLocal() as session:
        statement = select(HuntingJob).where(HuntingJob.id == job_id)
        job = (await session.execute(statement)).scalar_one_or_none()

    if job is None:
        await websocket.close(code=4004, reason="Job not found")
        return

    if not _user_can_access_job(user, job):
        await websocket.close(code=4003, reason="Forbidden")
        return

    await websocket.accept()

    try:
        while True:
            async with AsyncSessionLocal() as session:
                statement = select(HuntingJob).where(HuntingJob.id == job_id)
                job = (await session.execute(statement)).scalar_one_or_none()

            if job is None:
                await websocket.send_text(
                    json.dumps({"error": "Job not found", "job_id": str(job_id)})
                )
                await websocket.close(code=4004, reason="Job not found")
                return

            if not _user_can_access_job(user, job):
                await websocket.close(code=4003, reason="Forbidden")
                return

            await websocket.send_text(_job_payload(job))

            if job.status.value in _TERMINAL_STATUSES:
                await websocket.close(code=1000, reason="Job completed")
                return

            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

    except WebSocketDisconnect:
        pass
