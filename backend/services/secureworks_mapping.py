from __future__ import annotations


def _clean_string(value: object) -> str | None:
    if value is None:
        return None

    cleaned = str(value).strip()
    return cleaned or None


def _first_non_empty(values: list[object] | tuple[object, ...] | None) -> str | None:
    if not values:
        return None

    for value in values:
        cleaned = _clean_string(value)
        if cleaned:
            return cleaned

    return None


def extract_secureworks_endpoint(alert: dict) -> tuple[str | None, str | None]:
    for entity in alert.get("entities") or []:
        hostname = _clean_string(entity.get("hostname"))
        ip_address = _first_non_empty(entity.get("ipAddresses"))
        if hostname or ip_address:
            return hostname, ip_address

    return None, None


def build_secureworks_message(alert: dict) -> str:
    headline = _clean_string(alert.get("headline")) or "Secureworks Taegis XDR alert"
    severity = _clean_string(alert.get("severity"))
    status = _clean_string(alert.get("status"))

    parts = [headline]

    metadata = [item for item in [severity and f"severity={severity}", status and f"status={status}"] if item]
    if metadata:
        parts.append(f"Alert metadata: {', '.join(metadata)}.")

    indicators: list[str] = []
    for indicator in alert.get("indicators") or []:
        indicator_type = _clean_string(indicator.get("type")) or "indicator"
        indicator_value = _clean_string(indicator.get("value"))
        if indicator_value:
            indicators.append(f"{indicator_type}:{indicator_value}")

    if indicators:
        parts.append(f"Indicators: {', '.join(indicators[:10])}.")

    return " ".join(parts).strip()


def build_secureworks_log_record(
    alert: dict,
    *,
    source_name: str = "secureworks",
    event_type: str = "alert",
) -> dict:
    hostname, ip_address = extract_secureworks_endpoint(alert)
    return {
        "timestamp": alert.get("updatedAt") or alert.get("createdAt"),
        "message": build_secureworks_message(alert),
        "hostname": hostname,
        "ip_address": ip_address,
        "source": source_name,
        "event_type": event_type,
        "external_id": _clean_string(alert.get("id")),
        "raw_event": alert,
    }


def build_secureworks_log_records(
    alerts: list[dict],
    *,
    limit: int,
    source_name: str = "secureworks",
    event_type: str = "alert",
) -> list[dict]:
    records: list[dict] = []

    for alert in alerts:
        record = build_secureworks_log_record(
            alert,
            source_name=source_name,
            event_type=event_type,
        )
        if not record["message"]:
            continue
        records.append(record)
        if len(records) >= limit:
            break

    return records
