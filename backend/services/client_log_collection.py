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

_SUPPORTED_SOURCE_TYPES = {SourceType.SECUREWORKS, SourceType.MANUAL}
_SOURCE_AUTO_DISABLE_FAILURE_THRESHOLD = 5
_SOURCE_ERROR_MESSAGE_LIMIT = 1000


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


def _secureworks_alert_to_log_entry(alert: dict, *, source_name: str) -> ClientLogEntry:
    hostnames: list[str] = []
    ip_addresses: list[str] = []
    for entity in alert.get("entities") or []:
        if not isinstance(entity, dict):
            continue
        hostname = str(entity.get("hostname") or "").strip()
        if hostname:
            hostnames.append(hostname)
        for ip_address in entity.get("ipAddresses") or []:
            ip_value = str(ip_address or "").strip()
            if ip_value:
                ip_addresses.append(ip_value)

    indicator_values: list[str] = []
    for indicator in alert.get("indicators") or []:
        if not isinstance(indicator, dict):
            continue
        indicator_type = str(indicator.get("type") or "").strip()
        indicator_value = str(indicator.get("value") or "").strip()
        if indicator_value:
            indicator_values.append(
                f"{indicator_type}:{indicator_value}" if indicator_type else indicator_value
            )

    headline = str(alert.get("headline") or "Secureworks Taegis alert").strip()
    severity = str(alert.get("severity") or "unknown").strip()
    status = str(alert.get("status") or "unknown").strip()
    message_parts = [
        headline,
        f"severity={severity}",
        f"status={status}",
    ]
    if indicator_values:
        message_parts.append(f"indicators={', '.join(indicator_values[:10])}")

    return ClientLogEntry.model_validate(
        {
            "timestamp": alert.get("updatedAt") or alert.get("createdAt"),
            "message": " | ".join(message_parts),
            "hostname": hostnames[0] if hostnames else None,
            "ip_address": ip_addresses[0] if ip_addresses else None,
            "source": source_name,
            "event_type": "secureworks_alert",
            "external_id": alert.get("id"),
            "raw_event": alert,
        }
    )


def _collect_secureworks_logs(client: Client, source: Source, limit: int) -> list[ClientLogEntry]:
    if not client.api_key_vault_path:
        raise ValueError(
            f"Client '{client.name}' does not define a Vault path for Secureworks credentials."
        )

    alerts = pull_alerts_for_client(
        client.api_key_vault_path,
        client.secureworks_url,
    )
    return [
        _secureworks_alert_to_log_entry(alert, source_name=source.name)
        for alert in alerts[:limit]
    ]


async def collect_client_logs(
    session: AsyncSession,
    *,
    client_id: UUID,
    payload: ClientLogCollectionRequest,
) -> dict:
    client_statement = select(Client).where(Client.id == client_id, Client.is_active.is_(True))
    client = (await session.execute(client_statement)).scalar_one_or_none()
    if client is None:
        raise ValueError("Client not found or inactive.")

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
            if source.type == SourceType.SECUREWORKS:
                source_logs = await asyncio.to_thread(_collect_secureworks_logs, client, source, remaining)
            else:
                payload_text = await asyncio.to_thread(_read_source_payload, source)
                source_logs = _parse_log_entries(payload_text, remaining)
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
