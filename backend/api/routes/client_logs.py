import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth.rbac import get_current_user_with_rbac
from backend.db.database import get_db_session
from backend.models.client import Client
from backend.models.user import User
from backend.schemas.log_ingestion import (
    ClientLogCollectionRequest,
    ClientLogCollectionResponse,
    ClientLogIngestRequest,
    ClientLogIngestResponse,
    IndexedClientLogResponse,
)
from backend.services.client_log_collection import collect_client_logs
from backend.services.log_ingestion import ingest_client_logs, list_recent_client_logs

router = APIRouter(prefix="/admin/clients/{client_id}/logs", tags=["client-logs"])


async def _get_active_client_or_404(client_id: UUID, session: AsyncSession) -> Client:
    statement = select(Client).where(Client.id == client_id, Client.is_active.is_(True))
    client = (await session.execute(statement)).scalar_one_or_none()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Client not found or inactive.",
        )
    return client


@router.post("/ingest", response_model=ClientLogIngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_logs_for_client(
    client_id: UUID,
    payload: ClientLogIngestRequest,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ClientLogIngestResponse:
    await _get_active_client_or_404(client_id, session)
    try:
        index_name, ingested_count = await asyncio.to_thread(
            ingest_client_logs,
            client_id,
            payload.logs,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to ingest client logs into Elasticsearch.",
        ) from exc

    return ClientLogIngestResponse(
        client_id=client_id,
        index_name=index_name,
        ingested_count=ingested_count,
    )


@router.post("/collect", response_model=ClientLogCollectionResponse, status_code=status.HTTP_200_OK)
async def collect_logs_for_client(
    client_id: UUID,
    payload: ClientLogCollectionRequest,
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> ClientLogCollectionResponse:
    await _get_active_client_or_404(client_id, session)
    try:
        result = await collect_client_logs(
            session,
            client_id=client_id,
            payload=payload,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to collect client logs from the configured sources.",
        ) from exc

    return ClientLogCollectionResponse.model_validate(result)


@router.get("/recent", response_model=list[IndexedClientLogResponse], status_code=status.HTTP_200_OK)
async def list_recent_logs_for_client(
    client_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(get_current_user_with_rbac("admin_soc")),
    session: AsyncSession = Depends(get_db_session),
) -> list[IndexedClientLogResponse]:
    await _get_active_client_or_404(client_id, session)
    try:
        logs = await asyncio.to_thread(list_recent_client_logs, client_id, limit)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to read client logs from Elasticsearch.",
        ) from exc

    return [IndexedClientLogResponse.model_validate(log) for log in logs]
