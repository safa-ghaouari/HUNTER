import argparse
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path


DEFAULT_SOURCES = [
    {
        "name": "CERT-FR RSS",
        "type": "rss",
        "url": "https://www.cert.ssi.gouv.fr/feed/",
        "polling_interval_minutes": 60,
        "is_active": True,
    },
    {
        "name": "SANS ISC RSS",
        "type": "rss",
        "url": "https://isc.sans.edu/rssfeed.xml",
        "polling_interval_minutes": 60,
        "is_active": True,
    },
    {
        "name": "BleepingComputer RSS",
        "type": "rss",
        "url": "https://www.bleepingcomputer.com/feed/",
        "polling_interval_minutes": 90,
        "is_active": True,
    },
    {
        "name": "The Hacker News RSS",
        "type": "rss",
        "url": "https://feeds.feedburner.com/TheHackersNews",
        "polling_interval_minutes": 90,
        "is_active": True,
    },
    {
        "name": "CERT-FR Public MISP Feed",
        "type": "misp_feed",
        "url": "https://misp.cert.ssi.gouv.fr/feed-misp",
        "polling_interval_minutes": 180,
        "is_active": True,
    },
]


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def http_json(
    *,
    method: str,
    url: str,
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
    insecure: bool = False,
) -> dict | list:
    request_headers = {
        "Accept": "application/json",
        "User-Agent": "HUNTER-Phase2-Bootstrap/1.0",
    }
    if headers:
        request_headers.update(headers)

    data = None
    if payload is not None:
        request_headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(url, data=data, headers=request_headers, method=method)
    context = ssl._create_unverified_context() if insecure else None
    with urllib.request.urlopen(request, context=context, timeout=30) as response:  # noqa: S310
        body = response.read().decode("utf-8")
        return json.loads(body) if body else {}


def optional_sources(env: dict[str, str]) -> list[dict[str, object]]:
    sources: list[dict[str, object]] = []
    otx_api_key = env.get("OTX_API_KEY")
    if otx_api_key:
        sources.append(
            {
                "name": "AlienVault OTX Subscribed Pulses",
                "type": "otx",
                "url": "https://otx.alienvault.com/api/v1/pulses/subscribed",
                "polling_interval_minutes": 120,
                "is_active": True,
                "api_key": otx_api_key,
            }
        )

    abuse_ch_url = env.get("ABUSE_CH_URL")
    if abuse_ch_url:
        sources.append(
            {
                "name": "Abuse.ch Feed",
                "type": "abuse_ch",
                "url": abuse_ch_url,
                "polling_interval_minutes": 120,
                "is_active": True,
            }
        )

    circl_feed_url = env.get("CIRCL_FEED_URL")
    if circl_feed_url:
        sources.append(
            {
                "name": "CIRCL Feed",
                "type": "circl",
                "url": circl_feed_url,
                "polling_interval_minutes": 180,
                "is_active": True,
            }
        )

    return sources


def login(api_base_url: str, email: str, password: str) -> str:
    response = http_json(
        method="POST",
        url=f"{api_base_url.rstrip('/')}/auth/login",
        payload={"email": email, "password": password},
    )
    token = response.get("access_token")
    if not token:
        raise RuntimeError("Backend admin login failed during Phase 2 bootstrap.")
    return str(token)


def upsert_sources(api_base_url: str, token: str, sources: list[dict[str, object]]) -> list[str]:
    headers = {"Authorization": f"Bearer {token}"}
    current_sources = http_json(
        method="GET",
        url=f"{api_base_url.rstrip('/')}/admin/sources",
        headers=headers,
    )
    by_name = {item["name"]: item for item in current_sources}
    actions: list[str] = []

    for source in sources:
        existing = by_name.get(source["name"])
        if existing is None:
            created = http_json(
                method="POST",
                url=f"{api_base_url.rstrip('/')}/admin/sources",
                payload=source,
                headers=headers,
            )
            actions.append(f"created {created['name']} ({created['id']})")
            continue

        payload = {
            "name": source["name"],
            "url": source["url"],
            "polling_interval_minutes": source["polling_interval_minutes"],
            "is_active": source["is_active"],
        }
        if source.get("api_key"):
            payload["api_key"] = source["api_key"]

        updated = http_json(
            method="PATCH",
            url=f"{api_base_url.rstrip('/')}/admin/sources/{existing['id']}",
            payload=payload,
            headers=headers,
        )
        actions.append(f"updated {updated['name']} ({updated['id']})")

    return actions


def probe_misp(env: dict[str, str]) -> str:
    probe_url = env.get("MISP_BASE_URL") or env.get("MISP_URL")
    api_key = env.get("MISP_KEY")
    if not probe_url or not api_key:
        return "skipped: MISP probe variables are missing"

    normalized = probe_url.rstrip("/")
    try:
        http_json(
            method="GET",
            url=f"{normalized}/servers/getVersion",
            headers={"Authorization": api_key},
            insecure=normalized.startswith("https://"),
        )
        return "ok"
    except urllib.error.HTTPError as exc:
        return f"warning: HTTP {exc.code} from {normalized}/servers/getVersion"
    except Exception as exc:  # noqa: BLE001
        return f"warning: {exc}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Phase 2 collection sources and probe local MISP.")
    parser.add_argument("--api-base-url", default="http://localhost:8000")
    parser.add_argument("--env-file", default=".env")
    parser.add_argument("--admin-email", default=None)
    parser.add_argument("--admin-password", default=None)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    env = load_env(Path(args.env_file))
    admin_email = args.admin_email or env.get("BOOTSTRAP_ADMIN_EMAIL") or "soc.admin@hunter.local"
    admin_password = args.admin_password or env.get("BOOTSTRAP_ADMIN_PASSWORD") or "HunterAdmin2026Secure"

    token = login(args.api_base_url, admin_email, admin_password)
    actions = upsert_sources(args.api_base_url, token, [*DEFAULT_SOURCES, *optional_sources(env)])
    misp_status = probe_misp(env)

    print("Phase 2 bootstrap completed.")
    for action in actions:
        print(f"- {action}")
    print(f"- MISP probe: {misp_status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
