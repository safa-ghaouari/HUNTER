from __future__ import annotations

from unittest.mock import patch

import pytest

from backend.models.enums import SourceType
from backend.models.source import Source
from backend.services.source_collection import (
    _build_abuse_ch_dataset_url,
    collect_source_entries,
)


def test_build_abuse_ch_dataset_url_rewrites_legacy_url() -> None:
    url = _build_abuse_ch_dataset_url(
        "https://urlhaus-api.abuse.ch/v1/urls/recent/",
        "test-auth-key",
    )

    assert url == "https://urlhaus-api.abuse.ch/v2/files/exports/test-auth-key/recent.csv"


def test_collect_abuse_ch_entries_requires_auth_key() -> None:
    source = Source(
        name="Abuse.ch URLhaus",
        type=SourceType.ABUSE_CH,
        url="https://urlhaus-api.abuse.ch/v2/files/exports/{auth_key}/recent.csv",
        is_active=True,
        polling_interval_minutes=120,
    )

    with pytest.raises(ValueError, match="Auth-Key"):
        collect_source_entries(source)


def test_collect_abuse_ch_entries_uses_resolved_dataset_url() -> None:
    source = Source(
        name="Abuse.ch URLhaus",
        type=SourceType.ABUSE_CH,
        url="https://urlhaus-api.abuse.ch/v1/urls/recent/",
        is_active=True,
        polling_interval_minutes=120,
        api_key_vault_path="secret/sources/abuse-ch",
    )
    payload = (
        "# header\n"
        "1,2026-04-24 00:00:00,http://malware.test/payload.exe,online,,malware_download,"
        "test-tag,https://urlhaus.abuse.ch/url/1/,researcher\n"
    )

    with (
        patch("backend.services.source_collection.read_secret", return_value={"api_key": "test-auth-key"}),
        patch("backend.services.source_collection._read_text_from_url", return_value=payload) as mock_read,
    ):
        entries, notes = collect_source_entries(source)

    assert not notes
    assert entries[0]["link"] == "https://urlhaus.abuse.ch/url/1/"
    assert "http://malware.test/payload.exe" in entries[0]["content"]
    mock_read.assert_called_once_with(
        "https://urlhaus-api.abuse.ch/v2/files/exports/test-auth-key/recent.csv",
        {"User-Agent": "HUNTER-Collector/0.2"},
    )
