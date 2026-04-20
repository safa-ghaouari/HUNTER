import json
from datetime import datetime, timezone
from uuid import UUID

from backend.integrations.elasticsearch_client import (
    bulk_index_client_logs,
    fetch_recent_client_logs,
)
from backend.models.enums import IocType
from backend.schemas.log_ingestion import ClientLogEntry
from backend.services.ioc_extraction import extract_iocs, normalize_text

_IOC_BUCKETS = {
    IocType.IP: "observed_ips",
    IocType.DOMAIN: "observed_domains",
    IocType.URL: "observed_urls",
    IocType.MD5: "observed_hashes",
    IocType.SHA1: "observed_hashes",
    IocType.SHA256: "observed_hashes",
    IocType.EMAIL: "observed_emails",
    IocType.CVE: "observed_cves",
}


def _unique_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        cleaned = value.strip()
        if not cleaned:
            continue
        if cleaned in seen:
            continue
        seen.add(cleaned)
        unique_values.append(cleaned)
    return unique_values


def _to_utc_iso(timestamp: datetime | None) -> str:
    if timestamp is None:
        return datetime.now(timezone.utc).isoformat()
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc).isoformat()
    return timestamp.astimezone(timezone.utc).isoformat()


def _normalize_hostname(hostname: str | None) -> str | None:
    if hostname is None:
        return None
    cleaned = hostname.strip().lower()
    return cleaned or None


def _build_indexable_log(entry: ClientLogEntry) -> dict:
    normalized_message = normalize_text(entry.message).strip()
    extraction_parts = [normalized_message]
    if entry.ip_address:
        extraction_parts.append(entry.ip_address)
    if entry.raw_event:
        extraction_parts.append(json.dumps(entry.raw_event, ensure_ascii=True, sort_keys=True))

    extracted_iocs = extract_iocs(
        text="\n".join(part for part in extraction_parts if part),
        source_type="client_log",
        description_prefix=f"client log :: {entry.source or 'manual_ingest'}",
    )

    observable_fields = {
        "observed_ips": [],
        "observed_domains": [],
        "observed_urls": [],
        "observed_hashes": [],
        "observed_emails": [],
        "observed_cves": [],
    }
    indicator_values: list[str] = []

    for extracted in extracted_iocs:
        bucket = _IOC_BUCKETS.get(extracted["type"])
        if bucket is None:
            continue
        observable_fields[bucket].append(extracted["value_normalized"])
        indicator_values.append(extracted["value_normalized"])

    if entry.ip_address:
        observable_fields["observed_ips"].append(entry.ip_address.strip())
        indicator_values.append(entry.ip_address.strip())

    document = {
        "@timestamp": _to_utc_iso(entry.timestamp),
        "message": normalized_message,
        "source": entry.source or "manual_ingest",
        "event_type": entry.event_type or "generic",
        "hostname": _normalize_hostname(entry.hostname),
        "ip_address": entry.ip_address.strip() if entry.ip_address else None,
        "asset_type": entry.asset_type.value if entry.asset_type is not None else None,
        "os": entry.os,
        "external_id": entry.external_id,
        "indicator_values": _unique_preserving_order(indicator_values),
        "observed_ips": _unique_preserving_order(observable_fields["observed_ips"]),
        "observed_domains": _unique_preserving_order(observable_fields["observed_domains"]),
        "observed_urls": _unique_preserving_order(observable_fields["observed_urls"]),
        "observed_hashes": _unique_preserving_order(observable_fields["observed_hashes"]),
        "observed_emails": _unique_preserving_order(observable_fields["observed_emails"]),
        "observed_cves": _unique_preserving_order(observable_fields["observed_cves"]),
        "raw_event": entry.raw_event or None,
    }
    return {key: value for key, value in document.items() if value not in (None, [], "")}


def ingest_client_logs(client_id: UUID, logs: list[ClientLogEntry]) -> tuple[str, int]:
    documents = [_build_indexable_log(entry) for entry in logs]
    return bulk_index_client_logs(client_id, documents)


def list_recent_client_logs(client_id: UUID, limit: int) -> list[dict]:
    hits = fetch_recent_client_logs(client_id, limit=limit)
    response: list[dict] = []
    for hit in hits:
        source = hit.get("_source", {})
        response.append(
            {
                "id": hit.get("_id", ""),
                "timestamp": source.get("@timestamp"),
                "message": source.get("message", ""),
                "hostname": source.get("hostname"),
                "ip_address": source.get("ip_address"),
                "source": source.get("source"),
                "event_type": source.get("event_type"),
                "indicator_values": source.get("indicator_values", []),
            }
        )
    return response
