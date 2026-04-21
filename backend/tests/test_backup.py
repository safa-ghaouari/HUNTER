"""Unit tests for the PostgreSQL backup task.

pg_dump and MinIO calls are mocked — these tests verify the logic
(compression, object key format, pruning) without needing live services.
"""

from __future__ import annotations

import gzip
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

from backend.tasks.backup import _pg_connection_string, _prune_old_backups, perform_backup


class TestPgConnectionString:
    def test_asyncpg_replaced(self):
        url = "postgresql+asyncpg://user:pass@host:5432/db"
        assert _pg_connection_string(url) == "postgresql://user:pass@host:5432/db"

    def test_plain_postgres_unchanged(self):
        url = "postgresql://user:pass@host:5432/db"
        assert _pg_connection_string(url) == url


class TestPruneOldBackups:
    def _make_obj(self, name: str, ts: str):
        from datetime import datetime, timezone
        obj = MagicMock()
        obj.object_name = name
        obj.last_modified = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
        return obj

    def test_prune_removes_oldest(self):
        client = MagicMock()
        objects = [
            self._make_obj("backups/2024-01-01.sql.gz", "2024-01-01T00:00:00"),
            self._make_obj("backups/2024-01-02.sql.gz", "2024-01-02T00:00:00"),
            self._make_obj("backups/2024-01-03.sql.gz", "2024-01-03T00:00:00"),
        ]
        client.list_objects.return_value = objects

        pruned = _prune_old_backups(client, "hunter-backups", keep=2)

        assert pruned == 1
        client.remove_object.assert_called_once_with(
            "hunter-backups", "backups/2024-01-01.sql.gz"
        )

    def test_no_prune_when_under_limit(self):
        client = MagicMock()
        client.list_objects.return_value = [
            self._make_obj("backups/2024-01-01.sql.gz", "2024-01-01T00:00:00"),
        ]
        pruned = _prune_old_backups(client, "hunter-backups", keep=7)
        assert pruned == 0
        client.remove_object.assert_not_called()


class TestPerformBackup:
    def test_backup_success(self):
        fake_sql = (b"-- PostgreSQL dump\n" + b"INSERT INTO test VALUES (1);\n" * 200)

        mock_client = MagicMock()
        mock_client.list_objects.return_value = []

        with (
            patch("backend.tasks.backup.subprocess.run") as mock_run,
            patch("backend.tasks.backup.get_minio_client", return_value=mock_client),
            patch("backend.tasks.backup.init_bucket"),
        ):
            mock_run.return_value = MagicMock(returncode=0, stdout=fake_sql, stderr=b"")

            result = perform_backup()

        assert result["sql_bytes"] == len(fake_sql)
        assert result["size_bytes"] < result["sql_bytes"]  # compression reduced size
        assert result["object_key"].startswith("backups/")
        assert result["object_key"].endswith(".sql.gz")
        assert result["pruned_old_backups"] == 0

        mock_client.put_object.assert_called_once()
        call_kwargs = mock_client.put_object.call_args.kwargs
        assert call_kwargs["bucket_name"] == "hunter-backups"
        assert call_kwargs["content_type"] == "application/gzip"

        uploaded_data = call_kwargs["data"].read()
        assert gzip.decompress(uploaded_data) == fake_sql

    def test_backup_fails_on_pg_dump_error(self):
        with (
            patch("backend.tasks.backup.subprocess.run") as mock_run,
            patch("backend.tasks.backup.get_minio_client"),
            patch("backend.tasks.backup.init_bucket"),
        ):
            mock_run.return_value = MagicMock(
                returncode=1, stdout=b"", stderr=b"pg_dump: connection refused"
            )
            with pytest.raises(RuntimeError, match="pg_dump failed"):
                perform_backup()
