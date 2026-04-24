#!/usr/bin/env python
"""scripts/seed_sources.py — Phase 2: seed default intelligence sources.

Seeds the HUNTER database with the real public threat-intelligence feeds
required by Phase 2 of the spec:
  - CERT-FR RSS
  - SANS Internet Storm Center (ISC) RSS
  - BleepingComputer RSS
  - The Hacker News RSS
  - Abuse.ch URLhaus feed (authenticated CSV dataset)
  - CIRCL MISP feed (JSON)
  - AlienVault OTX pulse feed (RSS — public, no key needed for basic access)

Sources that already exist by name are skipped (idempotent).

Usage (from repo root, with the stack running):
    docker exec hunter-backend python scripts/seed_sources.py

Or locally with the venv activated and a .env pointing at running services:
    python scripts/seed_sources.py

To seed with an OTX API key (stored in Vault):
    OTX_API_KEY=<your_key> python scripts/seed_sources.py
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select

from backend.db.database import AsyncSessionLocal, engine
from backend.models import Base
from backend.models.enums import SourceType
from backend.models.source import Source

# ---------------------------------------------------------------------------
# Feed definitions — all sources required by hunter.md Phase 2
# ---------------------------------------------------------------------------

_DEFAULT_SOURCES: list[dict] = [
    # -----------------------------------------------------------------------
    # RSS feeds (Feedparser + Newspaper3k article scraping)
    # -----------------------------------------------------------------------
    {
        "name": "CERT-FR",
        "type": SourceType.RSS,
        "url": "https://www.cert.ssi.gouv.fr/feed/",
        "polling_interval_minutes": 60,
        "description": "French national CERT — advisories, alerts, IOC bulletins",
    },
    {
        "name": "SANS Internet Storm Center",
        "type": SourceType.RSS,
        "url": "https://isc.sans.edu/rssfeed_full.xml",
        "polling_interval_minutes": 60,
        "description": "SANS ISC — daily threat reports and handler diaries",
    },
    {
        "name": "BleepingComputer",
        "type": SourceType.RSS,
        "url": "https://www.bleepingcomputer.com/feed/",
        "polling_interval_minutes": 60,
        "description": "BleepingComputer — ransomware, malware, breach news",
    },
    {
        "name": "The Hacker News",
        "type": SourceType.RSS,
        "url": "https://feeds.feedburner.com/TheHackersNews",
        "polling_interval_minutes": 60,
        "description": "The Hacker News — CVE disclosures, APT activity, breach analysis",
    },
    # -----------------------------------------------------------------------
    # Abuse.ch URLhaus authenticated dataset download
    # -----------------------------------------------------------------------
    {
        "name": "Abuse.ch URLhaus",
        "type": SourceType.ABUSE_CH,
        "url": "https://urlhaus-api.abuse.ch/v2/files/exports/{auth_key}/recent.csv",
        "polling_interval_minutes": 120,
        "description": "Abuse.ch URLhaus — live malware distribution URLs",
        "api_key_env": "ABUSE_CH_AUTH_KEY",
    },
    # -----------------------------------------------------------------------
    # CIRCL MISP feed (public, no auth required)
    # -----------------------------------------------------------------------
    {
        "name": "CIRCL MISP Feed",
        "type": SourceType.CIRCL,
        "url": "https://www.circl.lu/doc/misp/feed-osint/manifest.json",
        "polling_interval_minutes": 240,
        "description": "CIRCL Luxembourg — public MISP OSINT feed (STIX / JSON)",
    },
    # -----------------------------------------------------------------------
    # AlienVault OTX (RSS public pulse feed — API key unlocks more)
    # -----------------------------------------------------------------------
    {
        "name": "AlienVault OTX",
        "type": SourceType.OTX,
        "url": "https://otx.alienvault.com/api/v1/pulses/subscribed?limit=20",
        "polling_interval_minutes": 120,
        "description": "AlienVault OTX — subscribed pulses (set OTX_API_KEY env var for auth)",
        "api_key_env": "OTX_API_KEY",
    },
]


# ---------------------------------------------------------------------------
# Seeding logic
# ---------------------------------------------------------------------------

async def _seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        stmt = select(Source.name)
        existing_names: set[str] = set((await session.execute(stmt)).scalars().all())

        created = 0
        skipped = 0
        for defn in _DEFAULT_SOURCES:
            name: str = defn["name"]
            if name in existing_names:
                print(f"  [skip]    {name} — already in database")
                skipped += 1
                continue

            api_key_vault_path: str | None = None
            api_key_env: str | None = defn.get("api_key_env")  # type: ignore[assignment]
            if api_key_env:
                api_key_value = os.environ.get(api_key_env, "").strip()
                if api_key_value:
                    import uuid as _uuid
                    source_id = _uuid.uuid4()
                    api_key_vault_path = f"secret/sources/{source_id}"
                    try:
                        from backend.integrations.vault_client import write_secret
                        write_secret(api_key_vault_path, {"api_key": api_key_value})
                        print(f"  [vault]   {name} — stored {api_key_env} in Vault at {api_key_vault_path}")
                    except Exception as vault_exc:
                        print(f"  [warn]    {name} — Vault write failed ({vault_exc}); source created without key")
                        api_key_vault_path = None
                        source_id = _uuid.uuid4()
                else:
                    import uuid as _uuid
                    source_id = _uuid.uuid4()
            else:
                import uuid as _uuid
                source_id = _uuid.uuid4()

            source = Source(
                id=source_id,
                name=name,
                type=defn["type"],
                url=defn.get("url"),
                polling_interval_minutes=defn.get("polling_interval_minutes", 60),
                is_active=True,
                api_key_vault_path=api_key_vault_path,
            )
            session.add(source)
            print(f"  [created] {name} ({defn['type'].value}) → {defn.get('url', 'no URL')[:70]}")
            created += 1

        await session.commit()

    print(f"\nDone — {created} source(s) created, {skipped} skipped.")


def main() -> None:
    print("=" * 60)
    print("  HUNTER — Seed default intelligence sources (Phase 2)")
    print("=" * 60)
    asyncio.run(_seed())


if __name__ == "__main__":
    main()
