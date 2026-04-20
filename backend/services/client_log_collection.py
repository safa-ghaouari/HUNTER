import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models.enums import SourceType
from backend.models.source import Source
from backend.schemas.log_ingestion import ClientLogCollectionRequest, ClientLogEntry
from backend.services.log_ingestion import ingest_client_logs

_SUPPORTED_SOURCE_TYPES = {SourceType.SECUREWORKS, SourceType.MANUAL}


def _read_source_payload(source: Source) -> str:
    if not source.url:
        raise ValueError(f"Source '{source.name}' does not define a URL.")

    parsed = urlparse(source.url)
    if parsed.scheme == "file":
        file_path = Path(parsed.path)
        if not file_path.exists():
            raise FileNotFoundError(f"Source file '{file_path}' does not exist.")
        return file_path.read_text(encoding="utf-8")

    if parsed.scheme in {"http", "https"}:
        request = Request(source.url, headers={"User-Agent": "HUNTER-Client-Collector/0.1"})
        with urlopen(request, timeout=20) as response:  # noqa: S310
            return response.read().decode("utf-8")

    raise ValueError(
        f"Source '{source.name}' uses unsupported URL scheme '{parsed.scheme or 'missing'}'."
    )


def _parse_log_entries(payload_text: str, limit: int) -> list[ClientLogEntry]:
    payload = json.loads(payload_text)
    if isinstance(payload, dict):
        log_items = payload.get("logs", [])
    elif isinstance(payload, list):
        log_items = payload
    else:
        raise ValueError("Collected payload must be a JSON object with a 'logs' field or a JSON array.")

    if not isinstance(log_items, list):
        raise ValueError("Collected payload 'logs' field must be a JSON array.")

    return [ClientLogEntry.model_validate(item) for item in log_items[:limit]]


async def collect_client_logs(
    session: AsyncSession,
    *,
    client_id: UUID,
    payload: ClientLogCollectionRequest,
) -> dict:
    statement = select(Source).where(Source.is_active.is_(True))
    if payload.source_id is not None:
        statement = statement.where(Source.id == payload.source_id)

    sources = (await session.execute(statement.order_by(Source.created_at.desc()))).scalars().all()
    if not sources:
        raise ValueError("No active sources found for client log collection.")

    collected_logs: list[ClientLogEntry] = []
    processed_source_ids: list[UUID] = []
    notes: list[str] = []
    remaining = payload.limit

    for source in sources:
        if source.type not in _SUPPORTED_SOURCE_TYPES:
            notes.append(
                f"source '{source.name}' skipped: unsupported collector type '{source.type.value}'"
            )
            continue
        if remaining <= 0:
            break

        try:
            payload_text = await asyncio.to_thread(_read_source_payload, source)
            source_logs = _parse_log_entries(payload_text, remaining)
        except Exception as exc:
            notes.append(f"source '{source.name}' failed: {exc}")
            continue

        if not source_logs:
            notes.append(f"source '{source.name}' returned no logs")
            continue

        collected_logs.extend(source_logs)
        processed_source_ids.append(source.id)
        source.last_polled_at = datetime.now(timezone.utc)
        remaining -= len(source_logs)
        notes.append(f"source '{source.name}' returned {len(source_logs)} logs")

    if not collected_logs:
        raise ValueError("No client logs were collected from the configured sources.")

    index_name, ingested_count = await asyncio.to_thread(
        ingest_client_logs,
        client_id,
        collected_logs,
    )
    await session.commit()

    return {
        "client_id": client_id,
        "index_name": index_name,
        "ingested_count": ingested_count,
        "source_ids": processed_source_ids,
        "sources_processed": len(processed_source_ids),
        "notes": notes,
    }
