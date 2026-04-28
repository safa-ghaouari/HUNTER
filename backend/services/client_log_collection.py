import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.integrations.secureworks_client import pull_alerts_for_client
from backend.models.client import Client
from backend.models.enums import SourceType
from backend.models.source import Source
from backend.schemas.log_ingestion import ClientLogCollectionRequest, ClientLogEntry
from backend.services.log_ingestion import ingest_client_logs
from backend.services.secureworks_mapping import build_secureworks_log_records

_SUPPORTED_SOURCE_TYPES = {SourceType.SECUREWORKS, SourceType.MANUAL}
_SOURCE_AUTO_DISABLE_FAILURE_THRESHOLD = 5
_SOURCE_ERROR_MESSAGE_LIMIT = 1000


def _require_active_client(client: Client | None, client_id: UUID) -> Client:
    if client is None or not client.is_active:
        raise ValueError(f"Client '{client_id}' was not found or is inactive.")
    return client


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


def _truncate_source_error(message: str) -> str:
    message = message.strip()
    if len(message) <= _SOURCE_ERROR_MESSAGE_LIMIT:
        return message
    return f"{message[:_SOURCE_ERROR_MESSAGE_LIMIT - 3]}..."


def _record_source_success(source: Source, completed_at: datetime) -> None:
    source.last_attempted_at = completed_at
    source.last_polled_at = completed_at
    source.last_failed_at = None
    source.consecutive_failures = 0
    source.last_error_message = None


def _record_source_failure(source: Source, *, error: Exception, failed_at: datetime) -> str:
    source.last_attempted_at = failed_at
    source.last_failed_at = failed_at
    source.consecutive_failures = (source.consecutive_failures or 0) + 1

    error_message = _truncate_source_error(str(error) or error.__class__.__name__)
    source.last_error_message = error_message

    if source.consecutive_failures >= _SOURCE_AUTO_DISABLE_FAILURE_THRESHOLD:
        source.is_active = False
        source.last_error_message = (
            f"Auto-disabled after {source.consecutive_failures} consecutive collection failures. "
            f"Last error: {error_message}"
        )
        return (
            f"source '{source.name}' auto-disabled after "
            f"{source.consecutive_failures} consecutive failures: {error_message}"
        )

    return (
        f"source '{source.name}' failed "
        f"({source.consecutive_failures} consecutive failure(s)): {error_message}"
    )


def _collect_source_logs(source: Source, client: Client, limit: int) -> list[ClientLogEntry]:
    if source.type == SourceType.MANUAL:
        payload_text = _read_source_payload(source)
        return _parse_log_entries(payload_text, limit)

    if source.type == SourceType.SECUREWORKS:
        if not client.api_key_vault_path:
            raise ValueError(
                f"Client '{client.name}' does not define a Vault path for Secureworks credentials."
            )
        alerts = pull_alerts_for_client(
            client.api_key_vault_path,
            client.secureworks_url or source.url,
        )
        secureworks_logs = build_secureworks_log_records(
            alerts,
            limit=limit,
            source_name=source.name,
            event_type="secureworks_alert",
        )
        return [ClientLogEntry.model_validate(item) for item in secureworks_logs]

    raise ValueError(f"Unsupported collector type '{source.type.value}'.")


async def collect_client_logs(
    session: AsyncSession,
    *,
    client_id: UUID,
    payload: ClientLogCollectionRequest,
) -> dict:
    client_statement = select(Client).where(Client.id == client_id)
    client = _require_active_client(
        (await session.execute(client_statement)).scalar_one_or_none(),
        client_id,
    )

    statement = select(Source).where(
        Source.is_active.is_(True),
        Source.client_id == client_id,
    )
    if payload.source_id is not None:
        statement = statement.where(Source.id == payload.source_id)

    sources = (await session.execute(statement.order_by(Source.created_at.desc()))).scalars().all()
    if not sources:
        raise ValueError("No active client-scoped sources found for client log collection.")

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

        source.last_attempted_at = datetime.now(timezone.utc)
        try:
            source_logs = await asyncio.to_thread(_collect_source_logs, source, client, remaining)
        except Exception as exc:
            notes.append(
                _record_source_failure(
                    source,
                    error=exc,
                    failed_at=datetime.now(timezone.utc),
                )
            )
            continue

        if not source_logs:
            notes.append(f"source '{source.name}' returned no logs")
            _record_source_success(source, datetime.now(timezone.utc))
            continue

        collected_logs.extend(source_logs)
        processed_source_ids.append(source.id)
        _record_source_success(source, datetime.now(timezone.utc))
        remaining -= len(source_logs)
        notes.append(f"source '{source.name}' returned {len(source_logs)} logs")

    await session.commit()

    if not collected_logs:
        raise ValueError("No client logs were collected from the configured sources.")

    index_name, ingested_count = await asyncio.to_thread(
        ingest_client_logs,
        client_id,
        collected_logs,
    )

    return {
        "client_id": client_id,
        "index_name": index_name,
        "ingested_count": ingested_count,
        "source_ids": processed_source_ids,
        "sources_processed": len(processed_source_ids),
        "notes": notes,
    }
