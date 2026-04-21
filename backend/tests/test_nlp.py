"""Unit tests for IoC extraction (pure logic, no DB or external deps)."""

from __future__ import annotations

import pytest

from backend.models.enums import IocType
from backend.services.ioc_extraction import extract_iocs, normalize_text


def _types(results, ioc_type: IocType) -> list[str]:
    return [r["value_normalized"] for r in results if r["type"] == ioc_type]


class TestNormalizeText:
    def test_defanged_dot(self):
        assert normalize_text("evil[.]com") == "evil.com"

    def test_hxxp_scheme(self):
        assert normalize_text("hxxp://evil.com/path") == "http://evil.com/path"

    def test_hxxps_scheme(self):
        assert normalize_text("hxxps://evil.com/path") == "https://evil.com/path"

    def test_multiple_defangs(self):
        result = normalize_text("hxxps://evil[.]com/path[.]php")
        assert result == "https://evil.com/path.php"

    def test_no_change_clean_text(self):
        text = "Normal text without defanging."
        assert normalize_text(text) == text


class TestExtractIoCs:
    def test_extracts_ip(self):
        results = extract_iocs("Attacker from 192.168.1.1 was seen.", "rss", "test")
        ips = _types(results, IocType.IP)
        assert "192.168.1.1" in ips

    def test_extracts_url(self):
        results = extract_iocs("Malware at https://evil.example.com/payload.exe", "rss", "test")
        urls = _types(results, IocType.URL)
        assert any("evil.example.com" in u for u in urls)

    def test_extracts_domain(self):
        results = extract_iocs("C2 at badactor.net was identified.", "rss", "test")
        domains = _types(results, IocType.DOMAIN)
        assert "badactor.net" in domains

    def test_extracts_sha256(self):
        sha = "a" * 64
        results = extract_iocs(f"Hash: {sha}", "rss", "test")
        hashes = _types(results, IocType.SHA256)
        assert sha in hashes

    def test_extracts_md5(self):
        md5 = "b" * 32
        results = extract_iocs(f"MD5: {md5}", "rss", "test")
        hashes = _types(results, IocType.MD5)
        assert md5 in hashes

    def test_extracts_cve(self):
        results = extract_iocs("Exploiting CVE-2024-12345 in the wild.", "rss", "test")
        cves = _types(results, IocType.CVE)
        assert "CVE-2024-12345" in cves

    def test_extracts_email(self):
        results = extract_iocs("Phishing from attacker@evil.org", "rss", "test")
        emails = _types(results, IocType.EMAIL)
        assert "attacker@evil.org" in emails

    def test_defanged_url_extracted(self):
        results = extract_iocs("Payload at hxxps://c2.evil.com/drop", "rss", "test")
        urls = _types(results, IocType.URL)
        assert any("c2.evil.com" in u for u in urls)

    def test_defanged_domain_dot(self):
        results = extract_iocs("C2 server: malware[.]io contacted.", "rss", "test")
        domains = _types(results, IocType.DOMAIN)
        assert "malware.io" in domains

    def test_deduplication_within_text(self):
        text = "IP 10.0.0.1 seen. IP 10.0.0.1 seen again."
        results = extract_iocs(text, "rss", "test")
        ips = _types(results, IocType.IP)
        assert ips.count("10.0.0.1") == 1

    def test_invalid_ip_skipped(self):
        results = extract_iocs("Version 999.999.999.999 installed.", "rss", "test")
        ips = _types(results, IocType.IP)
        assert "999.999.999.999" not in ips

    def test_source_type_preserved(self):
        results = extract_iocs("IP: 1.1.1.1", "abuse_ch", "prefix")
        assert results[0]["source_type"] == "abuse_ch"

    def test_severity_assigned(self):
        results = extract_iocs("https://evil.com/malware", "rss", "test")
        urls = [r for r in results if r["type"] == IocType.URL]
        assert len(urls) > 0
        assert urls[0]["severity"].value == "high"

    def test_cve_normalised_to_uppercase(self):
        results = extract_iocs("cve-2023-99999 is critical.", "rss", "test")
        cves = _types(results, IocType.CVE)
        assert "CVE-2023-99999" in cves

    def test_empty_text_returns_empty(self):
        assert extract_iocs("", "rss", "test") == []
