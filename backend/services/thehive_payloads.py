from __future__ import annotations

from typing import Any, Iterable


def _normalize_ioc_value(ioc: Any) -> str | None:
    if isinstance(ioc, dict):
        ioc_type = str(ioc.get("type") or "").strip()
        value = str(ioc.get("value_normalized") or ioc.get("value") or "").strip()
    else:
        ioc_type = str(getattr(getattr(ioc, "type", None), "value", getattr(ioc, "type", "")) or "").strip()
        value = str(getattr(ioc, "value_normalized", getattr(ioc, "value", "")) or "").strip()

    if not ioc_type or not value:
        return None

    return f"{ioc_type}:{value}"


def map_severity_to_thehive(severity: str | None) -> int:
    normalized = str(severity or "").strip().lower()
    if normalized == "critical":
        return 4
    if normalized == "high":
        return 3
    if normalized == "medium":
        return 2
    return 1


def build_case_description(
    *,
    client_name: str | None,
    alert_description: str | None,
    matched_iocs: Iterable[Any],
) -> str:
    lines = [
        "Automated incident case created by HUNTER.",
        f"Client: {client_name or 'unknown-client'}",
    ]

    cleaned_alert_description = str(alert_description or "").strip()
    if cleaned_alert_description:
        lines.extend(["", cleaned_alert_description])

    normalized_iocs = [value for value in (_normalize_ioc_value(ioc) for ioc in matched_iocs) if value]
    if normalized_iocs:
        lines.extend(["", "Matched IoCs:", ", ".join(normalized_iocs[:20])])

    return "\n".join(lines).strip()


def build_thehive_case_payload(
    *,
    title: str,
    alert_description: str | None,
    severity: str | None,
    client_name: str | None,
    matched_iocs: Iterable[Any],
    tags: list[str] | None = None,
    tlp: int = 2,
    pap: int = 2,
) -> dict[str, Any]:
    case_tags = sorted({*(tags or []), "auto-generated", "hunter"})

    return {
        "title": title,
        "description": build_case_description(
            client_name=client_name,
            alert_description=alert_description,
            matched_iocs=matched_iocs,
        ),
        "severity": map_severity_to_thehive(severity),
        "tlp": tlp,
        "pap": pap,
        "tags": case_tags,
    }
