"""Scheduled PostgreSQL backup task.

Runs pg_dump, gzips the output, and uploads to MinIO under
backups/YYYY-MM-DD_HH-MM-SS.sql.gz. Retains the 7 most recent
backups and removes older ones automatically.

Schedule: daily at 02:00 UTC (configured in celery_app.py beat_schedule).
Can also be triggered on demand: run_backup_task.delay()
"""

from __future__ import annotations

import gzip
import subprocess
from datetime import datetime, timezone
from urllib.parse import urlparse

from minio.error import S3Error

from backend.config import settings
from backend.storage.minio_client import get_minio_client, init_bucket
from backend.tasks.celery_app import celery_app
from backend.tasks.loop_runner import run_async

_BACKUP_BUCKET = "hunter-backups"
_BACKUP_PREFIX = "backups/"
_RETAIN_COUNT = 7


def _pg_connection_string(database_url: str) -> str:
    """Convert asyncpg URL to a plain postgres:// URL for pg_dump."""
    url = database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
    url = url.replace("postgres+asyncpg://", "postgresql://", 1)
    return url


def _run_pg_dump(connection_url: str) -> bytes:
    parsed = urlparse(connection_url)
    env = {
        "PGPASSWORD": parsed.password or "",
        "PATH": "/usr/bin:/usr/local/bin:/bin",
    }
    result = subprocess.run(
        [
            "pg_dump",
            "--no-password",
            "--format=plain",
            "--encoding=UTF8",
            connection_url,
        ],
        capture_output=True,
        env=env,
        timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed: {result.stderr.decode()[:500]}")
    return result.stdout


def _prune_old_backups(client, bucket: str, keep: int) -> int:
    objects = sorted(
        client.list_objects(bucket, prefix=_BACKUP_PREFIX),
        key=lambda o: o.last_modified,
    )
    to_delete = objects[:-keep] if len(objects) > keep else []
    for obj in to_delete:
        client.remove_object(bucket, obj.object_name)
    return len(to_delete)


def perform_backup() -> dict:
    """Execute the full backup cycle. Returns a summary dict."""
    connection_url = _pg_connection_string(settings.database_url)

    sql_bytes = _run_pg_dump(connection_url)
    compressed = gzip.compress(sql_bytes, compresslevel=6)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    object_key = f"{_BACKUP_PREFIX}{timestamp}.sql.gz"

    client = get_minio_client()
    try:
        init_bucket(_BACKUP_BUCKET)
    except S3Error:
        pass

    from io import BytesIO
    client.put_object(
        bucket_name=_BACKUP_BUCKET,
        object_name=object_key,
        data=BytesIO(compressed),
        length=len(compressed),
        content_type="application/gzip",
    )

    pruned = _prune_old_backups(client, _BACKUP_BUCKET, _RETAIN_COUNT)

    return {
        "object_key": object_key,
        "size_bytes": len(compressed),
        "sql_bytes": len(sql_bytes),
        "pruned_old_backups": pruned,
    }


@celery_app.task(name="backend.tasks.run_backup")
def run_backup_task() -> dict:
    return perform_backup()
