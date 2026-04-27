import ipaddress
import re
from collections.abc import Iterable

from backend.models.enums import IocType, Severity, TlpLevel

_DEFANG_DOT_PATTERN = re.compile(r"\[\.\]")
_URL_PATTERN = re.compile(r"\bhttps?://[^\s<>\"]+", re.IGNORECASE)
_DOMAIN_PATTERN = re.compile(
    r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b",
    re.IGNORECASE,
)
_EMAIL_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b", re.IGNORECASE)
_IP_PATTERN = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_CVE_PATTERN = re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.IGNORECASE)
_MD5_PATTERN = re.compile(r"\b[a-fA-F0-9]{32}\b")
_SHA256_PATTERN = re.compile(r"\b[a-fA-F0-9]{64}\b")


def normalize_text(text: str) -> str:
    normalized = _DEFANG_DOT_PATTERN.sub(".", text)
    normalized = normalized.replace("hxxp://", "http://").replace("hxxps://", "https://")
    return normalized


def _confidence_for_type(ioc_type: IocType) -> int:
    return {
        IocType.URL: 90,
        IocType.DOMAIN: 86,
        IocType.IP: 84,
        IocType.EMAIL: 78,
        IocType.CVE: 88,
        IocType.MD5: 80,
        IocType.SHA256: 92,
    }.get(ioc_type, 70)


def _severity_for_type(ioc_type: IocType) -> Severity:
    return {
        IocType.URL: Severity.HIGH,
        IocType.DOMAIN: Severity.HIGH,
        IocType.IP: Severity.MEDIUM,
        IocType.EMAIL: Severity.MEDIUM,
        IocType.CVE: Severity.HIGH,
        IocType.MD5: Severity.HIGH,
        IocType.SHA256: Severity.HIGH,
    }.get(ioc_type, Severity.MEDIUM)


def _iter_matches(pattern: re.Pattern[str], text: str) -> Iterable[str]:
    for match in pattern.findall(text):
        if isinstance(match, tuple):
            yield match[0]
        else:
            yield match


def extract_iocs(text: str, source_type: str, description_prefix: str) -> list[dict]:
    normalized_text = normalize_text(text)
    seen: set[tuple[IocType, str]] = set()
    results: list[dict] = []

    def add_match(ioc_type: IocType, raw_value: str, normalized_value: str) -> None:
        normalized_key = normalized_value.strip().lower()
        if not normalized_key:
            return
        dedupe_key = (ioc_type, normalized_key)
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)
        results.append(
            {
                "type": ioc_type,
                "value": raw_value,
                "value_normalized": normalized_value,
                "severity": _severity_for_type(ioc_type),
                "confidence": _confidence_for_type(ioc_type),
                "tlp": TlpLevel.AMBER,
                "source_type": source_type,
                "description": f"{description_prefix}: {normalized_value}",
            }
        )

    for raw_url in _iter_matches(_URL_PATTERN, normalized_text):
        cleaned = raw_url.rstrip(".,);]")
        add_match(IocType.URL, raw_url, cleaned)

    for raw_domain in _iter_matches(_DOMAIN_PATTERN, normalized_text):
        cleaned = raw_domain.lower().rstrip(".")
        add_match(IocType.DOMAIN, raw_domain, cleaned)

    for raw_email in _iter_matches(_EMAIL_PATTERN, normalized_text):
        add_match(IocType.EMAIL, raw_email, raw_email.lower())

    for raw_cve in _iter_matches(_CVE_PATTERN, normalized_text):
        add_match(IocType.CVE, raw_cve, raw_cve.upper())

    for raw_hash in _iter_matches(_SHA256_PATTERN, normalized_text):
        add_match(IocType.SHA256, raw_hash, raw_hash.lower())

    for raw_hash in _iter_matches(_MD5_PATTERN, normalized_text):
        add_match(IocType.MD5, raw_hash, raw_hash.lower())

    for raw_ip in _iter_matches(_IP_PATTERN, normalized_text):
        try:
            parsed_ip = ipaddress.ip_address(raw_ip)
        except ValueError:
            continue
        add_match(IocType.IP, raw_ip, str(parsed_ip))

    return results
