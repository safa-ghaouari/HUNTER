import asyncio
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import cast, or_, select
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.ext.asyncio import AsyncSession

from backend.integrations.elasticsearch_client import search_client_logs_by_ioc
from backend.models.alert import Alert
from backend.models.asset import Asset
from backend.models.enums import (
    AlertStatus,
    AssetCriticality,
    AssetType,
    Severity,
)
from backend.models.ioc import IoC
from backend.models.threat import Threat

_SEVERITY_RANK = {
    Severity.INFO: 1,
    Severity.LOW: 2,
    Severity.MEDIUM: 3,
    Severity.HIGH: 4,
    Severity.CRITICAL: 5,
}
_SEVERITY_BY_RANK = {rank: severity for severity, rank in _SEVERITY_RANK.items()}
_CRITICALITY_BOOST = {
    AssetCriticality.LOW: 0,
    AssetCriticality.MEDIUM: 0,
    AssetCriticality.HIGH: 1,
    AssetCriticality.CRITICAL: 2,
}


def _asset_label(hostname: str | None, ip_address: str | None) -> str:
    return hostname or ip_address or "unknown-asset"


def _default_asset_criticality(asset_type: AssetType | None) -> AssetCriticality:
    if asset_type == AssetType.SERVER:
        return AssetCriticality.HIGH
    if asset_type == AssetType.NETWORK_DEVICE:
        return AssetCriticality.HIGH
    return AssetCriticality.MEDIUM


def _score_severity(base_severity: Severity, criticality: AssetCriticality) -> Severity:
    ranked = _SEVERITY_RANK[base_severity] + _CRITICALITY_BOOST[criticality]
    return _SEVERITY_BY_RANK[min(ranked, max(_SEVERITY_BY_RANK))]


async def _get_or_create_asset(
    session: AsyncSession,
    *,
    client_id: UUID,
    hostname: str | None,
    ip_address: str | None,
    asset_type_value: str | None,
    os_value: str | None,
) -> Asset | None:
    if not hostname and not ip_address:
        return None

    filters = []
    if hostname:
        filters.append(Asset.hostname == hostname)
    if ip_address:
        filters.append(Asset.ip_address == cast(ip_address, INET))

    statement = select(Asset).where(Asset.client_id == client_id, or_(*filters))
    asset = (await session.execute(statement)).scalar_one_or_none()

    asset_type = AssetType(asset_type_value) if asset_type_value in AssetType._value2member_map_ else AssetType.OTHER

    if asset is None:
        asset = Asset(
            client_id=client_id,
            hostname=hostname,
            ip_address=ip_address,
            asset_type=asset_type,
            os=os_value,
            criticality=_default_asset_criticality(asset_type),
            discovered_at=datetime.now(timezone.utc),
        )
        session.add(asset)
        await session.flush()
        return asset

    if hostname and not asset.hostname:
        asset.hostname = hostname
    if ip_address and not asset.ip_address:
        asset.ip_address = ip_address
    if os_value and not asset.os:
        asset.os = os_value
    if asset.asset_type == AssetType.OTHER and asset_type != AssetType.OTHER:
        asset.asset_type = asset_type
    if asset.discovered_at is None:
        asset.discovered_at = datetime.now(timezone.utc)

    return asset


def _build_alert_description(hit_source: dict, matched_iocs: list[IoC]) -> str:
    message_excerpt = str(hit_source.get("message", "")).strip().replace("\n", " ")
    if len(message_excerpt) > 400:
        message_excerpt = f"{message_excerpt[:397]}..."

    matched_values = ", ".join(
        f"{ioc.type.value}:{ioc.value_normalized}" for ioc in matched_iocs
    )

    lines = [
        f"Matched IoCs: {matched_values}",
        f"Log source: {hit_source.get('source', 'unknown')}",
        f"Event type: {hit_source.get('event_type', 'generic')}",
        f"Observed at: {hit_source.get('@timestamp', 'unknown')}",
    ]
    if message_excerpt:
        lines.append(f"Message: {message_excerpt}")
    return "\n".join(lines)


async def correlate_iocs_for_client(
    session: AsyncSession,
    *,
    client_id: UUID,
    hunting_job_id: UUID,
    iocs: list[IoC],
    threat: Threat | None = None,
) -> list[Alert]:
    grouped_hits: dict[str, dict] = {}

    for ioc in iocs:
        hits = await asyncio.to_thread(
            search_client_logs_by_ioc,
            client_id,
            ioc_type=ioc.type,
            value=ioc.value_normalized,
        )
        for hit in hits:
            hit_id = f"{hit.get('_index')}:{hit.get('_id')}"
            bucket = grouped_hits.setdefault(
                hit_id,
                {
                    "hit": hit,
                    "iocs": [],
                },
            )
            bucket["iocs"].append(ioc)

    created_alerts: list[Alert] = []
    primary_technique = threat.mitre_techniques[0] if threat and threat.mitre_techniques else None

    for bucket in grouped_hits.values():
        hit = bucket["hit"]
        hit_source = hit.get("_source", {})
        matched_iocs = list({ioc.id: ioc for ioc in bucket["iocs"]}.values())
        hostname = hit_source.get("hostname")
        ip_address = hit_source.get("ip_address")

        asset = await _get_or_create_asset(
            session,
            client_id=client_id,
            hostname=hostname,
            ip_address=ip_address,
            asset_type_value=hit_source.get("asset_type"),
            os_value=hit_source.get("os"),
        )

        primary_ioc = max(matched_iocs, key=lambda candidate: _SEVERITY_RANK[candidate.severity])
        asset_criticality = asset.criticality if asset is not None else AssetCriticality.MEDIUM
        severity = _score_severity(primary_ioc.severity, asset_criticality)
        asset_name = _asset_label(hostname, ip_address)

        alert = Alert(
            client_id=client_id,
            hunting_job_id=hunting_job_id,
            asset_id=asset.id if asset is not None else None,
            threat_id=threat.id if threat is not None else None,
            severity=severity,
            status=AlertStatus.OPEN,
            title=f"{primary_ioc.type.value.upper()} {primary_ioc.value_normalized} detected on {asset_name}",
            description=_build_alert_description(hit_source, matched_iocs),
            raw_log_ref=f"{hit.get('_index')}:{hit.get('_id')}",
            mitre_technique_id=primary_technique,
        )
        alert.iocs = matched_iocs
        session.add(alert)
        created_alerts.append(alert)

    if created_alerts:
        await session.flush()

    return created_alerts
