"""WebSocket endpoint — real-time job-status push.

Clients subscribe to a specific hunting job by connecting to:

    ws://<host>/ws/jobs/{job_id}

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


@router.websocket("/ws/jobs/{job_id}")
async def job_status_ws(websocket: WebSocket, job_id: UUID) -> None:
    """Stream live status for a hunting job.

    Authentication: pass the JWT access token as a query parameter:
        ?token=<access_token>
    """
    token = websocket.query_params.get("token", "")
    try:
        verify_token(token)
    except Exception:
        await websocket.close(code=4001, reason="Unauthorized")
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

            await websocket.send_text(_job_payload(job))

            if job.status.value in _TERMINAL_STATUSES:
                await websocket.close(code=1000, reason="Job completed")
                return

            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

    except WebSocketDisconnect:
        pass
