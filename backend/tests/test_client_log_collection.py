from __future__ import annotations

from unittest.mock import patch

import pytest

from backend.models.client import Client
from backend.models.enums import SourceType
from backend.models.source import Source
from backend.schemas.log_ingestion import ClientLogCollectionRequest
from backend.services.client_log_collection import collect_client_logs

pytestmark = pytest.mark.asyncio


class TestClientLogCollection:
    async def test_collect_client_logs_uses_only_client_scoped_sources(self, db_session):
        target_client = Client(name="Target Client", api_key_vault_path="secret/clients/target")
        other_client = Client(name="Other Client", api_key_vault_path="secret/clients/other")
        db_session.add_all([target_client, other_client])
        await db_session.commit()
        await db_session.refresh(target_client)
        await db_session.refresh(other_client)

        target_source = Source(
            name="Target Manual Logs",
            type=SourceType.MANUAL,
            url="file:///tmp/target.json",
            client_id=target_client.id,
            is_active=True,
            polling_interval_minutes=60,
        )
        other_source = Source(
            name="Other Manual Logs",
            type=SourceType.MANUAL,
            url="file:///tmp/other.json",
            client_id=other_client.id,
            is_active=True,
            polling_interval_minutes=60,
        )
        db_session.add_all([target_source, other_source])
        await db_session.commit()

        payload_text = '{"logs":[{"message":"client-specific log","source":"manual"}]}'
        with (
            patch("backend.services.client_log_collection._read_source_payload", return_value=payload_text) as mock_read,
            patch("backend.services.client_log_collection.ingest_client_logs", return_value=("client-target", 1)),
        ):
            result = await collect_client_logs(
                db_session,
                client_id=target_client.id,
                payload=ClientLogCollectionRequest(limit=10),
            )

        assert result["ingested_count"] == 1
        assert result["sources_processed"] == 1
        assert result["source_ids"] == [target_source.id]
        assert mock_read.call_count == 1
        assert "Target Manual Logs" in result["notes"][0]

    async def test_collect_client_logs_secureworks_uses_real_connector(self, db_session):
        client = Client(
            name="Secureworks Client",
            api_key_vault_path="secret/clients/secureworks",
            secureworks_url="https://taegis.example.test",
        )
        db_session.add(client)
        await db_session.commit()
        await db_session.refresh(client)

        source = Source(
            name="Secureworks Taegis",
            type=SourceType.SECUREWORKS,
            client_id=client.id,
            is_active=True,
            polling_interval_minutes=60,
        )
        db_session.add(source)
        await db_session.commit()
        await db_session.refresh(source)

        alerts = [
            {
                "id": "alert-1",
                "headline": "Suspicious PowerShell",
                "severity": "high",
                "status": "open",
                "createdAt": "2026-04-24T10:00:00Z",
                "updatedAt": "2026-04-24T10:05:00Z",
                "entities": [{"hostname": "workstation-1", "ipAddresses": ["10.0.0.5"]}],
                "indicators": [{"type": "domain", "value": "evil.example.com"}],
            }
        ]

        with (
            patch("backend.services.client_log_collection.pull_alerts_for_client", return_value=alerts) as mock_pull,
            patch("backend.services.client_log_collection.ingest_client_logs", return_value=("client-secureworks", 1)) as mock_ingest,
        ):
            result = await collect_client_logs(
                db_session,
                client_id=client.id,
                payload=ClientLogCollectionRequest(limit=10),
            )

        mock_pull.assert_called_once_with(client.api_key_vault_path, client.secureworks_url)
        ingested_logs = mock_ingest.call_args.args[1]
        assert ingested_logs[0].source == "Secureworks Taegis"
        assert ingested_logs[0].event_type == "secureworks_alert"
        assert ingested_logs[0].hostname == "workstation-1"
        assert result["source_ids"] == [source.id]
