"""Sigma rule engine — converts YAML rules to Lucene queries and runs them against
each client's Elasticsearch log index.

Flow:
  1. Load every .yml from sigma_rules/ at first call (cached for the process lifetime).
  2. Convert each SigmaRule to a Lucene query string via pySigma LuceneBackend.
  3. Execute the query against the client's per-tenant index.
  4. Return raw ES hits with rule metadata attached so the caller can build Alerts.

Rules that fail conversion (e.g. unsupported field modifiers) are skipped with a
warning rather than crashing the scan — partial coverage is better than no coverage.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path
from uuid import UUID

from sigma.backends.elasticsearch import LuceneBackend
from sigma.collection import SigmaCollection
from sigma.rule import SigmaLevel

from backend.integrations.elasticsearch_client import (
    client_logs_index_name,
    get_elasticsearch_client,
)
from backend.models.enums import Severity

logger = logging.getLogger(__name__)

# sigma_rules/ is copied to /app/sigma_rules in the Docker image.
# When running locally the path resolves to <repo-root>/sigma_rules.
_SIGMA_RULES_DIR: Path = Path(__file__).parent.parent.parent / "sigma_rules"

_SIGMA_LEVEL_TO_SEVERITY: dict[SigmaLevel, Severity] = {
    SigmaLevel.INFORMATIONAL: Severity.INFO,
    SigmaLevel.LOW: Severity.LOW,
    SigmaLevel.MEDIUM: Severity.MEDIUM,
    SigmaLevel.HIGH: Severity.HIGH,
    SigmaLevel.CRITICAL: Severity.CRITICAL,
}
_TECHNIQUE_RE = re.compile(r"^attack\.(t\d{4}(?:\.\d{3})?)$", re.IGNORECASE)


@lru_cache(maxsize=1)
def _load_compiled_rules() -> list[dict]:
    """Load and compile all Sigma rules once per worker process.

    Returns a list of dicts:
        {
            rule_id:    str,
            title:      str,
            severity:   Severity,
            mitre_id:   str | None,   # first ATT&CK technique tag, e.g. "T1550.002"
            query:      str,          # Lucene query string
        }
    """
    rules_dir = _SIGMA_RULES_DIR
    if not rules_dir.exists():
        logger.error("sigma_rules directory not found at %s — no Sigma detection.", rules_dir)
        return []

    rule_files = sorted(rules_dir.glob("*.yml"))
    if not rule_files:
        logger.warning("No .yml files found in %s", rules_dir)
        return []

    try:
        collection = SigmaCollection.load_ruleset([str(f) for f in rule_files])
    except Exception:
        logger.exception("Failed to load Sigma rule collection from %s", rules_dir)
        return []

    backend = LuceneBackend()
    compiled: list[dict] = []

    for rule in collection:
        # Extract first ATT&CK technique ID from tags
        mitre_id: str | None = None
        for tag in rule.tags or []:
            m = _TECHNIQUE_RE.match(str(tag))
            if m:
                mitre_id = m.group(1).upper()
                break

        severity = _SIGMA_LEVEL_TO_SEVERITY.get(rule.level, Severity.MEDIUM)

        try:
            queries = backend.convert_rule(rule)
        except Exception as exc:
            logger.warning("Sigma rule '%s' (%s) could not be converted: %s", rule.title, rule.id, exc)
            continue

        for query_str in queries:
            compiled.append({
                "rule_id": str(rule.id),
                "title": rule.title,
                "severity": severity,
                "mitre_id": mitre_id,
                "query": query_str,
            })

    logger.info("Sigma engine: %d compiled queries from %d rules.", len(compiled), len(rule_files))
    return compiled


def run_sigma_rules_for_client(client_id: UUID, *, max_hits_per_rule: int = 50) -> list[dict]:
    """Run all compiled Sigma queries against a single client's ES index.

    Returns a flat list of hit dicts, each containing:
        rule_id, title, severity, mitre_id — from the Sigma rule
        hit                                 — raw ES hit dict (_index, _id, _source)
    """
    compiled_rules = _load_compiled_rules()
    if not compiled_rules:
        return []

    es = get_elasticsearch_client()
    index_name = client_logs_index_name(client_id)

    try:
        if not es.indices.exists(index=index_name):
            return []
    except Exception:
        logger.warning("Cannot reach Elasticsearch checking index '%s'.", index_name)
        return []

    results: list[dict] = []

    for rule_entry in compiled_rules:
        try:
            response = es.search(
                index=index_name,
                query={"query_string": {"query": rule_entry["query"], "default_field": "message"}},
                size=max_hits_per_rule,
                sort=[{"@timestamp": {"order": "desc", "unmapped_type": "date"}}],
            )
        except Exception as exc:
            logger.warning("Sigma query for rule '%s' failed: %s", rule_entry["title"], exc)
            continue

        for hit in response["hits"]["hits"]:
            results.append({
                "rule_id":   rule_entry["rule_id"],
                "title":     rule_entry["title"],
                "severity":  rule_entry["severity"],
                "mitre_id":  rule_entry["mitre_id"],
                "hit":       hit,
            })

    return results
