#!/usr/bin/env python
"""scripts/init_db.py — Phase 1 database initialisation.

Runs Alembic migrations to HEAD and creates the bootstrap admin user
defined in .env (BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD).

Usage (from repo root, with the stack running):
    docker exec hunter-backend python scripts/init_db.py

Or locally with the venv activated and a .env in the working directory:
    python scripts/init_db.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Make sure the repo root is on PYTHONPATH so backend imports work.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import subprocess

from alembic import command as alembic_command
from alembic.config import Config as AlembicConfig
from sqlalchemy import select

from backend.auth.password import get_password_hash
from backend.config import settings
from backend.db.database import AsyncSessionLocal, engine
from backend.models import Base
from backend.models.user import User, UserRole


# ---------------------------------------------------------------------------
# Step 1 — Alembic migrations
# ---------------------------------------------------------------------------

def run_migrations() -> None:
    alembic_cfg = AlembicConfig(str(ROOT / "backend" / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(ROOT / "backend" / "db" / "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url.replace("+asyncpg", "+psycopg2"))
    print("[init_db] Running Alembic migrations → HEAD …")
    alembic_command.upgrade(alembic_cfg, "head")
    print("[init_db] Migrations complete.")


# ---------------------------------------------------------------------------
# Step 2 — Bootstrap admin user
# ---------------------------------------------------------------------------

async def _ensure_admin() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    if not settings.bootstrap_admin_email or not settings.bootstrap_admin_password:
        print("[init_db] BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD not set — skipping admin creation.")
        return

    async with AsyncSessionLocal() as session:
        stmt = select(User).where(User.email == settings.bootstrap_admin_email.lower())
        existing = (await session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            print(f"[init_db] Admin '{settings.bootstrap_admin_email}' already exists — skipped.")
            return

        session.add(
            User(
                email=settings.bootstrap_admin_email.lower(),
                hashed_password=get_password_hash(settings.bootstrap_admin_password),
                role=UserRole.ADMIN_SOC,
            )
        )
        await session.commit()
        print(f"[init_db] Bootstrap admin created: {settings.bootstrap_admin_email}")


# ---------------------------------------------------------------------------
# Step 3 — MinIO bucket
# ---------------------------------------------------------------------------

def _init_minio() -> None:
    from backend.storage.minio_client import init_bucket
    print(f"[init_db] Ensuring MinIO bucket '{settings.minio_bucket}' exists …")
    init_bucket(settings.minio_bucket)
    print("[init_db] MinIO bucket ready.")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("  HUNTER — Database initialisation (Phase 1)")
    print("=" * 60)

    try:
        run_migrations()
    except Exception as exc:
        print(f"[init_db] WARNING: Alembic migration failed: {exc}")
        print("[init_db] Falling back to SQLAlchemy create_all …")

    asyncio.run(_ensure_admin())

    try:
        _init_minio()
    except Exception as exc:
        print(f"[init_db] WARNING: MinIO init failed (is the stack running?): {exc}")

    print("[init_db] Done.")


if __name__ == "__main__":
    main()
