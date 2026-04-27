"""Phase 3 — LangChain + Ollama (Mistral) RAG pipeline.

Generates a professional Threat Hunting Intelligence Summary by feeding
the collection context (entries, IoC stats, NER entities, classification)
to Mistral running locally via Ollama.

Design:
  - Retrieval: the "retrieval" step is a TF-IDF selection of the most
    relevant entries by keyword overlap with the hunt theme.  This keeps
    the context window focused and avoids sending raw HTML to the LLM.
  - Generation: LangChain LLMChain with a structured analyst prompt.
  - Fallback: if Ollama is unreachable a deterministic rule-based summary
    is generated instead — the hunting job never fails because of LLM
    unavailability.

Public API:
    generate_hunt_summary(
        theme: str,
        entries: list[dict],
        ioc_stats: dict,
        ner_entities: list[dict],
        classification: dict,
    ) -> dict
    # {"summary": "<text>", "model": "mistral", "source": "ollama"|"fallback"}
"""

from __future__ import annotations

import re
from collections import Counter

import requests

from backend.config import settings

_OLLAMA_MODEL = "llama3.2"
_MAX_CONTEXT_ENTRIES = 8      # number of entries sent to Mistral
_MAX_ENTRY_CHARS = 600        # characters per entry in the context


# ---------------------------------------------------------------------------
# Ollama health check
# ---------------------------------------------------------------------------

def _ollama_available() -> bool:
    """Return True if the Ollama service is up and the model is loaded."""
    for attempt in range(3):
        try:
            resp = requests.get(
                f"{settings.ollama_url}/api/tags",
                timeout=30,
            )
            if resp.status_code != 200:
                return False
            tags = resp.json().get("models", [])
            return any(_OLLAMA_MODEL in (m.get("name", "")) for m in tags)
        except Exception:
            if attempt == 2:
                return False
            import time
            time.sleep(10)
    return False


# ---------------------------------------------------------------------------
# Retrieval — select the most relevant entries for the context window
# ---------------------------------------------------------------------------

def _score_entry(entry: dict, theme_tokens: set[str]) -> int:
    text = (entry.get("title", "") + " " + entry.get("content", "")).lower()
    return sum(1 for tok in theme_tokens if tok in text)


def _retrieve_top_entries(entries: list[dict], theme: str, k: int) -> list[dict]:
    theme_tokens = set(re.findall(r"[a-z0-9]{3,}", theme.lower()))
    if not theme_tokens:
        return entries[:k]
    scored = sorted(entries, key=lambda e: _score_entry(e, theme_tokens), reverse=True)
    return scored[:k]


def _format_entry(entry: dict) -> str:
    title = entry.get("title", "Untitled")
    content = (entry.get("content", "")).strip().replace("\n", " ")
    if len(content) > _MAX_ENTRY_CHARS:
        content = content[:_MAX_ENTRY_CHARS] + "…"
    source = entry.get("source_name", "unknown")
    return f"[{source}] {title}: {content}"


# ---------------------------------------------------------------------------
# Fallback summary — generated without LLM
# ---------------------------------------------------------------------------

def _fallback_summary(
    theme: str,
    entries: list[dict],
    ioc_stats: dict,
    ner_entities: list[dict],
    classification: dict,
) -> str:
    n_entries = len(entries)
    n_iocs = ioc_stats.get("total", 0)
    top_label = classification.get("label", "unknown")
    confidence = classification.get("confidence", 0.0)

    top_malware = [e["text"] for e in ner_entities if e["label"] == "MALWARE"][:3]
    top_actors  = [e["text"] for e in ner_entities if e["label"] == "APT_ACTOR"][:3]
    top_cves    = [e["text"] for e in ner_entities if e["label"] == "CVE"][:5]

    lines = [
        f"Threat Hunting Intelligence Summary — {theme.title()}",
        "",
        f"This automated collection analysed {n_entries} intelligence items and "
        f"extracted {n_iocs} indicators of compromise.",
        "",
        f"Content classification: {top_label} (confidence {confidence:.0%}).",
    ]

    if top_malware:
        lines.append(f"Malware families identified: {', '.join(top_malware)}.")
    if top_actors:
        lines.append(f"Threat actors referenced: {', '.join(top_actors)}.")
    if top_cves:
        lines.append(f"CVEs mentioned: {', '.join(top_cves)}.")

    ioc_breakdown = ioc_stats.get("by_type", {})
    if ioc_breakdown:
        breakdown_str = ", ".join(f"{v} {k}" for k, v in ioc_breakdown.items() if v)
        lines.append(f"IoC breakdown: {breakdown_str}.")

    lines += [
        "",
        "Analysts should review the extracted indicators, validate against "
        "client environment logs, and prioritise remediation of any matched assets.",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Ollama generation via LangChain
# ---------------------------------------------------------------------------

def _generate_with_ollama(
    theme: str,
    context_text: str,
    ioc_stats: dict,
    ner_entities: list[dict],
    classification: dict,
) -> str:
    from langchain_community.llms import Ollama
    from langchain_core.prompts import PromptTemplate

    top_entities = ", ".join(
        f"{e['text']} ({e['label']})"
        for e in ner_entities[:10]
        if e["label"] in {"MALWARE", "APT_ACTOR", "CVE"}
    ) or "none identified"

    ioc_breakdown = ", ".join(
        f"{v} {k}" for k, v in ioc_stats.get("by_type", {}).items() if v
    ) or "none"

    template = PromptTemplate.from_template(
        """You are a senior SOC analyst writing a professional Threat Hunting \
Intelligence Summary for a MSSP report.

Hunt theme: {theme}
Threat classification: {classification_label} (confidence {confidence:.0%})
Total IoCs extracted: {total_iocs} ({ioc_breakdown})
Key entities identified: {top_entities}

Intelligence sources (top relevant excerpts):
{context}

Write a concise, professional 3-paragraph summary covering:
1. Overview of the threat activity observed
2. Key indicators and affected technologies
3. Recommended analyst actions

Use precise security terminology. Do not fabricate data not present above."""
    )

    llm = Ollama(
        base_url=settings.ollama_url,
        model=_OLLAMA_MODEL,
        temperature=0.1,
        num_predict=600,
        timeout=300,
    )

    chain = template | llm
    return chain.invoke({
        "theme": theme,
        "classification_label": classification.get("label", "unknown"),
        "confidence": classification.get("confidence", 0.0),
        "total_iocs": ioc_stats.get("total", 0),
        "ioc_breakdown": ioc_breakdown,
        "top_entities": top_entities,
        "context": context_text,
    })


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def generate_hunt_summary(
    theme: str,
    entries: list[dict],
    ioc_stats: dict,
    ner_entities: list[dict],
    classification: dict,
) -> dict:
    """Generate an intelligence summary for the hunt.

    Args:
        theme:          Hunt theme string (e.g. "ransomware", "CVE-2024-1234")
        entries:        List of collected entry dicts (title, content, source_name)
        ioc_stats:      {"total": int, "by_type": {"ip": 5, "domain": 12, ...}}
        ner_entities:   Output of nlp_ner.extract_cyber_entities()
        classification: Output of nlp_classifier.classify_threat()

    Returns:
        {"summary": str, "model": str, "source": "ollama" | "fallback"}
    """
    top_entries = _retrieve_top_entries(entries, theme, _MAX_CONTEXT_ENTRIES)
    context_text = "\n\n".join(_format_entry(e) for e in top_entries)

    if _ollama_available():
        try:
            summary = _generate_with_ollama(
                theme=theme,
                context_text=context_text,
                ioc_stats=ioc_stats,
                ner_entities=ner_entities,
                classification=classification,
            )
            return {"summary": summary.strip(), "model": _OLLAMA_MODEL, "source": "ollama"}
        except Exception:
            pass   # fall through to rule-based fallback

    summary = _fallback_summary(
        theme=theme,
        entries=entries,
        ioc_stats=ioc_stats,
        ner_entities=ner_entities,
        classification=classification,
    )
    return {"summary": summary, "model": "rule-based", "source": "fallback"}
