from __future__ import annotations

import csv
import io
import json
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import feedparser
import requests
from bs4 import BeautifulSoup

from backend.integrations.vault_client import read_secret
from backend.models.enums import SourceType
from backend.models.source import Source

_COLLECTION_ITEM_LIMIT = 20
_ARTICLE_TEXT_LIMIT = 12000
DEFAULT_ABUSE_CH_DATASET_URL = "https://urlhaus-api.abuse.ch/v2/files/exports/{auth_key}/recent.csv"
_ABUSE_CH_AUTH_KEY_PLACEHOLDER = "{auth_key}"
_ABUSE_CH_LEGACY_RECENT_URLS = {
    "https://urlhaus-api.abuse.ch/v1/urls/recent",
    "https://urlhaus-api.abuse.ch/v1/urls/recent/",
}

# newspaper4k (the maintained Newspaper3k successor) is used for full article
# extraction.  It is optional at import time so the collector degrades
# gracefully to BeautifulSoup if the library is absent or fails to import.
try:
    from newspaper import Article as _NewspaperArticle  # type: ignore[import-untyped]
    _NEWSPAPER_AVAILABLE = True
except ImportError:
    _NEWSPAPER_AVAILABLE = False


def _source_headers(source: Source) -> dict[str, str]:
    headers = {"User-Agent": "HUNTER-Collector/0.2"}
    if not source.api_key_vault_path:
        return headers

    try:
        secret = read_secret(source.api_key_vault_path)
    except Exception:
        return headers

    api_key = str(secret.get("api_key") or "").strip()
    if not api_key:
        return headers

    if source.type == SourceType.OTX:
        headers["X-OTX-API-KEY"] = api_key
    elif source.type == SourceType.ABUSE_CH:
        return headers
    else:
        headers["Authorization"] = api_key
    return headers


def _read_text_from_url(url: str, headers: dict[str, str]) -> str:
    parsed = urlparse(url)
    if parsed.scheme == "file":
        file_path = parsed.path
        if parsed.netloc:
            file_path = f"/{parsed.netloc}{parsed.path}"
        return Path(file_path).read_text(encoding="utf-8")
    if parsed.scheme in {"http", "https"}:
        response = requests.get(url, headers=headers, timeout=60, allow_redirects=True, verify=False)
        response.raise_for_status()
        return response.text
    raise ValueError(f"Unsupported source URL scheme '{parsed.scheme or 'missing'}'.")


def _scrape_article_with_newspaper(url: str) -> tuple[str, str]:
    """Use newspaper4k (Newspaper3k successor) for full article extraction.

    Returns (title, body) where body is limited to _ARTICLE_TEXT_LIMIT chars.
    Raises any exception on failure so the caller can fall back to BeautifulSoup.
    """
    article = _NewspaperArticle(url, language="en", fetch_images=False)
    article.download()
    article.parse()
    title = (article.title or "").strip()
    body = (article.text or "").strip()
    return title, body[:_ARTICLE_TEXT_LIMIT]


def _scrape_article_with_bs4(url: str, headers: dict[str, str]) -> tuple[str, str]:
    """BeautifulSoup fallback — used when newspaper4k is unavailable or fails."""
    html = _read_text_from_url(url, headers)
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.get_text(" ", strip=True) if soup.title else "").strip()
    container = soup.find("article") or soup.find("main") or soup.body or soup
    paragraphs = [node.get_text(" ", strip=True) for node in container.find_all(["p", "li", "h1", "h2", "h3"])]
    body = " ".join(part for part in paragraphs if part).strip()
    return title, body[:_ARTICLE_TEXT_LIMIT]


def _scrape_article_text(url: str, headers: dict[str, str]) -> tuple[str, str]:
    """Try newspaper4k first; fall back to BeautifulSoup on any failure."""
    parsed = urlparse(url)
    # newspaper4k only supports real HTTP(S) URLs — skip for local file:// fixtures.
    if _NEWSPAPER_AVAILABLE and parsed.scheme in {"http", "https"}:
        try:
            return _scrape_article_with_newspaper(url)
        except Exception:
            pass
    return _scrape_article_with_bs4(url, headers)


def _clean_html_text(value: str | None) -> str:
    if not value:
        return ""
    return BeautifulSoup(value, "html.parser").get_text(" ", strip=True)


def _collect_rss_entries(source: Source) -> tuple[list[dict[str, str]], list[str]]:
    headers = _source_headers(source)
    payload = _read_text_from_url(source.url or "", headers)
    parsed_feed = feedparser.parse(payload)
    notes: list[str] = []
    entries: list[dict[str, str]] = []

    for feed_entry in parsed_feed.entries[:_COLLECTION_ITEM_LIMIT]:
        title = str(feed_entry.get("title") or source.name).strip()
        link = str(feed_entry.get("link") or "").strip()
        summary = _clean_html_text(feed_entry.get("summary") or feed_entry.get("description"))
        article_title = ""
        article_body = ""
        if link:
            try:
                article_title, article_body = _scrape_article_text(link, headers)
            except Exception as exc:
                notes.append(f"article scrape failed for '{link}': {exc}")

        content_parts = [title, summary, article_title, article_body, link]
        content = "\n".join(part for part in content_parts if part).strip()
        if not content:
            continue

        entries.append(
            {
                "source_name": source.name,
                "source_type": source.type.value,
                "title": article_title or title,
                "link": link,
                "content": content,
            }
        )

    return entries, notes


def _flatten_payload_records(payload: object) -> list[str]:
    records: list[str] = []

    def visit(value: object) -> None:
        if isinstance(value, dict):
            if "indicator" in value and isinstance(value["indicator"], str):
                fields = [str(value.get(key, "")) for key in ("title", "description", "indicator", "type")]
                records.append(" ".join(part for part in fields if part).strip())
                return
            scalar_parts = [str(item) for item in value.values() if isinstance(item, (str, int, float))]
            if scalar_parts:
                records.append(" ".join(part for part in scalar_parts if part).strip())
            for nested in value.values():
                if isinstance(nested, (dict, list)):
                    visit(nested)
            return

        if isinstance(value, list):
            for item in value:
                visit(item)
            return

        if isinstance(value, (str, int, float)):
            records.append(str(value))

    visit(payload)
    return [record for record in records if record][: _COLLECTION_ITEM_LIMIT]


def _collect_generic_intel_entries(source: Source) -> tuple[list[dict[str, str]], list[str]]:
    headers = _source_headers(source)
    payload_text = _read_text_from_url(source.url or "", headers)
    notes: list[str] = []
    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError:
        payload = payload_text

    records = _flatten_payload_records(payload)
    if not records:
        return [], [f"source '{source.name}' returned no usable records"]

    entries = [
        {
            "source_name": source.name,
            "source_type": source.type.value,
            "title": f"{source.name} record {index + 1}",
            "link": source.url or "",
            "content": record,
        }
        for index, record in enumerate(records)
    ]
    return entries, notes


_URLHAUS_CSV_COLUMNS = ("id", "date_added", "url", "url_status", "last_online", "threat", "tags", "urlhaus_link", "reporter")


def _build_abuse_ch_dataset_url(url_template: str, auth_key: str) -> str:
    template = (url_template or "").strip() or DEFAULT_ABUSE_CH_DATASET_URL
    if template.rstrip("/") in {item.rstrip("/") for item in _ABUSE_CH_LEGACY_RECENT_URLS}:
        template = DEFAULT_ABUSE_CH_DATASET_URL

    if _ABUSE_CH_AUTH_KEY_PLACEHOLDER in template:
        return template.replace(_ABUSE_CH_AUTH_KEY_PLACEHOLDER, auth_key)

    parsed = urlparse(template)
    path_parts = [part for part in parsed.path.split("/") if part]
    if path_parts[:3] != ["v2", "files", "exports"]:
        raise ValueError(
            "Abuse.ch URLhaus sources must use the v2 dataset download endpoint "
            "or include the '{auth_key}' placeholder in the URL."
        )

    dataset_parts = path_parts[3:] if len(path_parts) == 4 else path_parts[4:]
    if not dataset_parts:
        raise ValueError("Abuse.ch URLhaus dataset URL is missing the export filename.")

    updated_path = "/" + "/".join(["v2", "files", "exports", auth_key, *dataset_parts])
    return urlunparse(parsed._replace(path=updated_path))


def _resolve_abuse_ch_dataset_url(source: Source) -> str:
    if not source.api_key_vault_path:
        raise ValueError(
            "Abuse.ch URLhaus collection requires an Auth-Key stored in Vault. "
            "Update the source with an API key before enabling it."
        )

    try:
        secret = read_secret(source.api_key_vault_path)
    except Exception as exc:
        raise ValueError(
            f"Abuse.ch URLhaus Auth-Key could not be read from Vault path '{source.api_key_vault_path}'."
        ) from exc

    auth_key = str(secret.get("api_key") or secret.get("auth_key") or "").strip()
    if not auth_key:
        raise ValueError(
            "Abuse.ch URLhaus collection requires an Auth-Key in Vault under 'api_key' or 'auth_key'."
        )

    return _build_abuse_ch_dataset_url(source.url or DEFAULT_ABUSE_CH_DATASET_URL, auth_key)


def _collect_abuse_ch_csv_entries(source: Source) -> tuple[list[dict[str, str]], list[str]]:
    """Parse the Abuse.ch URLhaus authenticated CSV dataset download."""
    headers = _source_headers(source)
    payload_text = _read_text_from_url(_resolve_abuse_ch_dataset_url(source), headers)

    data_lines = [line for line in payload_text.splitlines() if line and not line.startswith("#")]
    if not data_lines:
        return [], [f"source '{source.name}' returned empty CSV"]

    reader = csv.DictReader(data_lines, fieldnames=_URLHAUS_CSV_COLUMNS)
    entries: list[dict[str, str]] = []
    for row in reader:
        url_value = (row.get("url") or "").strip()
        threat = (row.get("threat") or "").strip()
        tags = (row.get("tags") or "").strip()
        if not url_value:
            continue
        content = f"Malicious URL: {url_value}. Threat: {threat}. Tags: {tags}."
        entries.append(
            {
                "source_name": source.name,
                "source_type": source.type.value,
                "title": f"URLhaus: {threat or 'malware'} — {url_value[:80]}",
                "link": row.get("urlhaus_link") or url_value,
                "content": content,
            }
        )
        if len(entries) >= _COLLECTION_ITEM_LIMIT:
            break

    if not entries:
        return [], [f"source '{source.name}' CSV contained no usable URL rows"]
    return entries, []


def collect_source_entries(source: Source) -> tuple[list[dict[str, str]], list[str]]:
    if source.type == SourceType.RSS:
        return _collect_rss_entries(source)
    if source.type == SourceType.ABUSE_CH:
        return _collect_abuse_ch_csv_entries(source)
    if source.type in {SourceType.MISP_FEED, SourceType.OTX, SourceType.CIRCL}:
        return _collect_generic_intel_entries(source)
    raise ValueError(f"Unsupported source type '{source.type.value}' for threat-intelligence collection.")
