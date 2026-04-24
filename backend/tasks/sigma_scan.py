"""Celery task: periodic Sigma rule scan across all active clients.

Schedule: every 15 minutes (configured in celery_app.py beat_schedule).

For each client:
  1. Run all compiled Sigma queries against hunter-client-logs-{client_id}
  2. For each hit, compute a dedup key: "sigma:{rule_id}:{es_index}:{es_doc_id}"
  3. Skip if an Alert with that raw_log_ref already exists (prevents duplicate alerts
     when the same document is hit across multiple scan cycles)
  4. Create an Asset record for the source host if one doesn't exist yet
  5. Create an Alert row (hunting_job_id=None — Sigma scans are autonomous, not
     triggered by a SOC analyst job)

Severity comes directly from the Sigma rule's `level` field.
MITRE technique ID comes from the first `attack.tXXXX` tag on the rule.
"""

from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.db.database import AsyncSessionLocal
from backend.models.alert import Alert
from backend.models.asset import Asset
from backend.models.client import Client
from backend.models.enums import AlertStatus, AssetCriticality, AssetType
from backend.services.correlation import _get_or_create_asset
from backend.services.sigma_runner import run_sigma_rules_for_client
from backend.tasks.celery_app import celery_app
from backend.tasks.loop_runner import run_async

logger = logging.getLogger(__name__)


# ── helpers ────────────────────────────────────────────────────────────────────

def _raw_log_ref(rule_id: str, es_hit: dict) -> str:
    return f"sigma:{rule_id}:{es_hit.get('_index', '')}:{es_hit.get('_id', '')}"


async def _alert_exists(session: AsyncSession, client_id: UUID, ref: str) -> bool:
    row = await session.execute(
        select(Alert.id).where(
            Alert.client_id == client_id,
            Alert.raw_log_ref == ref,
        ).limit(1)
    )
    return row.scalar_one_or_none() is not None


def _asset_type_from_source(hit_source: dict) -> AssetType:
    raw = (hit_source.get("asset_type") or "").lower()
    try:
        return AssetType(raw)
    except ValueError:
        return AssetType.OTHER


# ── per-client scan ────────────────────────────────────────────────────────────

async def _scan_client(session: AsyncSession, client: Client) -> int:
    """Scan one client; returns number of new alerts created."""
    sigma_hits = await asyncio.to_thread(
        run_sigma_rules_for_client, client.id
    )
    if not sigma_hits:
        return 0

    new_alerts = 0

    for hit_entry in sigma_hits:
        rule_id   = hit_entry["rule_id"]
        es_hit    = hit_entry["hit"]
        hit_src   = es_hit.get("_source", {})
        ref       = _raw_log_ref(rule_id, es_hit)

        if await _alert_exists(session, client.id, ref):
            continue

        hostname   = hit_src.get("hostname")
        ip_address = hit_src.get("ip_address")

        asset = await _get_or_create_asset(
            session,
            client_id=client.id,
            hostname=hostname,
            ip_address=ip_address,
            asset_type_value=hit_src.get("asset_type"),
            os_value=hit_src.get("os"),
        )

        message_excerpt = str(hit_src.get("message", "")).strip().replace("\n", " ")
        if len(message_excerpt) > 400:
            message_excerpt = f"{message_excerpt[:397]}..."

        asset_label = hostname or ip_address or "unknown-asset"
        description_lines = [
            f"Sigma rule: {hit_entry['title']}",
            f"Log source: {hit_src.get('source', 'unknown')}",
            f"Event type: {hit_src.get('event_type', 'generic')}",
            f"Observed at: {hit_src.get('@timestamp', 'unknown')}",
        ]
        if message_excerpt:
            description_lines.append(f"Message: {message_excerpt}")

        alert = Alert(
            client_id=client.id,
            hunting_job_id=None,
            asset_id=asset.id if asset else None,
            threat_id=None,
            severity=hit_entry["severity"],
            status=AlertStatus.OPEN,
            title=f"[Sigma] {hit_entry['title']} on {asset_label}",
            description="\n".join(description_lines),
            raw_log_ref=ref,
            mitre_technique_id=hit_entry["mitre_id"],
        )
        session.add(alert)
        new_alerts += 1

    if new_alerts:
        await session.flush()

    return new_alerts


# ── full scan across all clients ───────────────────────────────────────────────

async def _run_sigma_scan_all_clients() -> dict:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Client).where(Client.is_active.is_(True)))
        clients = result.scalars().all()

        total_alerts = 0
        client_summary: list[dict] = []

        for client in clients:
            try:
                created = await _scan_client(session, client)
                total_alerts += created
                client_summary.append({"client_id": str(client.id), "new_alerts": created})
            except Exception:
                logger.exception("Sigma scan failed for client %s", client.id)
                client_summary.append({"client_id": str(client.id), "error": True})

        await session.commit()

    logger.info("Sigma scan complete — %d new alerts across %d clients.", total_alerts, len(clients))
    return {"total_alerts": total_alerts, "clients": client_summary}


# ── Celery task ────────────────────────────────────────────────────────────────

@celery_app.task(name="backend.tasks.run_sigma_scan", bind=False)
def run_sigma_scan() -> dict:
    return run_async(_run_sigma_scan_all_clients())
