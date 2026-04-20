"""IoC enrichment clients — VirusTotal, Shodan, AbuseIPDB.

Each function returns a dict that is stored as-is in iocs.enrichment (JSONB).
All calls are best-effort: errors are caught and returned as {"error": "..."} so
a single failing provider never blocks the others.
"""

from __future__ import annotations

import requests

from backend.config import settings
from backend.models.enums import IocType

_TIMEOUT = 20


def _vt_headers() -> dict[str, str]:
    return {"x-apikey": settings.virustotal_api_key or ""}


def enrich_virustotal(ioc_type: IocType, value: str) -> dict:
    """Query VirusTotal v3 for IPs, domains, URLs, and file hashes."""
    key = settings.virustotal_api_key
    if not key:
        return {"error": "VIRUSTOTAL_API_KEY not configured"}

    try:
        if ioc_type == IocType.IP:
            url = f"https://www.virustotal.com/api/v3/ip_addresses/{value}"
        elif ioc_type == IocType.DOMAIN:
            url = f"https://www.virustotal.com/api/v3/domains/{value}"
        elif ioc_type == IocType.URL:
            import base64
            url_id = base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")
            url = f"https://www.virustotal.com/api/v3/urls/{url_id}"
        elif ioc_type in {IocType.MD5, IocType.SHA1, IocType.SHA256}:
            url = f"https://www.virustotal.com/api/v3/files/{value}"
        else:
            return {"skipped": f"VirusTotal does not support type '{ioc_type.value}'"}

        r = requests.get(url, headers=_vt_headers(), timeout=_TIMEOUT)
        if r.status_code == 404:
            return {"found": False}
        r.raise_for_status()
        attrs = r.json().get("data", {}).get("attributes", {})
        stats = attrs.get("last_analysis_stats", {})
        return {
            "found": True,
            "malicious": stats.get("malicious", 0),
            "suspicious": stats.get("suspicious", 0),
            "harmless": stats.get("harmless", 0),
            "undetected": stats.get("undetected", 0),
            "reputation": attrs.get("reputation"),
            "tags": attrs.get("tags", []),
            "last_analysis_date": attrs.get("last_analysis_date"),
        }
    except Exception as exc:
        return {"error": str(exc)}


def enrich_shodan(value: str) -> dict:
    """Query Shodan host info for IP addresses."""
    key = settings.shodan_api_key
    if not key:
        return {"error": "SHODAN_API_KEY not configured"}

    try:
        r = requests.get(
            f"https://api.shodan.io/shodan/host/{value}",
            params={"key": key},
            timeout=_TIMEOUT,
        )
        if r.status_code == 404:
            return {"found": False}
        r.raise_for_status()
        data = r.json()
        return {
            "found": True,
            "country": data.get("country_name"),
            "org": data.get("org"),
            "isp": data.get("isp"),
            "os": data.get("os"),
            "open_ports": data.get("ports", []),
            "hostnames": data.get("hostnames", []),
            "vulns": list(data.get("vulns", {}).keys()),
            "last_update": data.get("last_update"),
        }
    except Exception as exc:
        return {"error": str(exc)}


def enrich_abuseipdb(value: str) -> dict:
    """Query AbuseIPDB confidence score for IP addresses."""
    key = settings.abuseipdb_api_key
    if not key:
        return {"error": "ABUSEIPDB_API_KEY not configured"}

    try:
        r = requests.get(
            "https://api.abuseipdb.com/api/v2/check",
            headers={"Key": key, "Accept": "application/json"},
            params={"ipAddress": value, "maxAgeInDays": 90, "verbose": True},
            timeout=_TIMEOUT,
        )
        r.raise_for_status()
        data = r.json().get("data", {})
        return {
            "found": True,
            "abuse_confidence_score": data.get("abuseConfidenceScore", 0),
            "total_reports": data.get("totalReports", 0),
            "country": data.get("countryCode"),
            "isp": data.get("isp"),
            "domain": data.get("domain"),
            "is_whitelisted": data.get("isWhitelisted", False),
            "usage_type": data.get("usageType"),
            "last_reported_at": data.get("lastReportedAt"),
        }
    except Exception as exc:
        return {"error": str(exc)}


def enrich_ioc(ioc_type: IocType, value: str) -> dict:
    """Run all applicable enrichment providers for a given IoC and merge results."""
    result: dict = {}

    result["virustotal"] = enrich_virustotal(ioc_type, value)

    if ioc_type == IocType.IP:
        result["shodan"] = enrich_shodan(value)
        result["abuseipdb"] = enrich_abuseipdb(value)

    return result
