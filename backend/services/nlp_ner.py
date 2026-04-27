"""Phase 3 — spaCy NER pipeline for cybersecurity entity extraction.

Loads en_core_web_sm once (module-level singleton) and extends it with a
custom EntityRuler that recognises cyber-specific entity types:

  MALWARE     — ransomware / malware family names
  APT_ACTOR   — known threat actor / APT group names
  CVE         — CVE identifiers  (CVE-YYYY-NNNNN)
  HASH_MD5    — MD5 hashes (32 hex chars)
  HASH_SHA256 — SHA-256 hashes (64 hex chars)
  IP_ADDR     — IPv4 addresses
  DOMAIN      — domain names
  ORG         — organisations (from spaCy base model)
  PRODUCT     — software products (from spaCy base model)

Public API:
    extract_cyber_entities(text: str) -> list[dict]
    # Returns: [{"text": "LockBit", "label": "MALWARE", "count": 3}, ...]
"""

from __future__ import annotations

import re
import threading
from collections import Counter
from typing import Optional

import spacy
from spacy.language import Language

# ---------------------------------------------------------------------------
# Cyber entity data — malware families and APT actors
# ---------------------------------------------------------------------------

_MALWARE_NAMES: list[str] = [
    "LockBit", "Ryuk", "REvil", "BlackCat", "ALPHV", "Conti", "Maze",
    "Hive", "BlackMatter", "DarkSide", "NotPetya", "WannaCry", "Petya",
    "Emotet", "TrickBot", "Qakbot", "BazarLoader", "IcedID", "Dridex",
    "Cobalt Strike", "Mimikatz", "Metasploit", "PowerSploit", "Empire",
    "AsyncRAT", "NjRAT", "RedLine", "Raccoon", "AgentTesla", "FormBook",
    "GuLoader", "Remcos", "AZORult", "Vidar", "Lumma", "StealC",
    "BlackByte", "Royal", "Play", "Akira", "Cl0p", "LockBit 3.0",
    "PlugX", "Gh0st", "njRAT", "QuasarRAT", "DcRAT", "XWorm",
    "Ursnif", "ZLoader", "BumbleBee", "Gozi", "Hancitor",
    "CryptoLocker", "Locky", "Cerber", "GandCrab", "Sodinokibi",
]

_APT_ACTORS: list[str] = [
    "Lazarus Group", "APT28", "APT29", "APT41", "APT10", "APT32",
    "APT33", "APT34", "APT35", "APT37", "APT38", "APT40", "APT43",
    "Fancy Bear", "Cozy Bear", "Sandworm", "Equation Group", "Turla",
    "Kimsuky", "Scattered Spider", "UNC2452", "UNC3524", "UNC4841",
    "Volt Typhoon", "Salt Typhoon", "Midnight Blizzard", "Comet Tempest",
    "FIN7", "FIN8", "LAPSUS$", "RansomHub", "Scattered Spider",
    "TA505", "TA453", "TA416", "Muddled Libra", "Star Blizzard",
    "Charming Kitten", "Transparent Tribe", "Gamaredon", "Sofacy",
]

# ---------------------------------------------------------------------------
# Regex patterns for structured cyber indicators
# ---------------------------------------------------------------------------

_CVE_RE     = re.compile(r"\bCVE-\d{4}-\d{4,7}\b", re.IGNORECASE)
_MD5_RE     = re.compile(r"\b[a-fA-F0-9]{32}\b")
_SHA256_RE  = re.compile(r"\b[a-fA-F0-9]{64}\b")
_IP_RE      = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_DOMAIN_RE  = re.compile(
    r"\b(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|ru|cn|de|fr|uk|gov|mil|edu|info|biz|xyz|top|club|online|site|store|tech|app|cloud)\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# spaCy model — lazy singleton, thread-safe initialisation
# ---------------------------------------------------------------------------

_nlp: Optional[Language] = None
_nlp_lock = threading.Lock()


def _build_nlp() -> Language:
    nlp = spacy.load("en_core_web_sm", disable=["parser", "lemmatizer"])

    # EntityRuler must be added BEFORE the ner component so custom patterns
    # take priority over the statistical model.
    ruler = nlp.add_pipe("entity_ruler", before="ner", config={"overwrite_ents": True})

    patterns: list[dict] = []

    # Single-token malware names
    for name in _MALWARE_NAMES:
        tokens = name.split()
        if len(tokens) == 1:
            patterns.append({"label": "MALWARE", "pattern": name})
            patterns.append({"label": "MALWARE", "pattern": name.upper()})
            patterns.append({"label": "MALWARE", "pattern": name.lower()})
        else:
            # Multi-token — use token list pattern
            patterns.append({
                "label": "MALWARE",
                "pattern": [{"LOWER": t.lower()} for t in tokens],
            })

    # APT actor names (multi-token aware)
    for name in _APT_ACTORS:
        tokens = name.split()
        if len(tokens) == 1:
            patterns.append({"label": "APT_ACTOR", "pattern": name})
        else:
            patterns.append({
                "label": "APT_ACTOR",
                "pattern": [{"LOWER": t.lower()} for t in tokens],
            })

    ruler.add_patterns(patterns)
    return nlp


def _get_nlp() -> Language:
    global _nlp
    if _nlp is None:
        with _nlp_lock:
            if _nlp is None:
                _nlp = _build_nlp()
    return _nlp


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def extract_cyber_entities(text: str) -> list[dict]:
    """Extract and aggregate cybersecurity entities from *text*.

    Returns a list of dicts sorted by count (descending):
        [{"text": "LockBit", "label": "MALWARE", "count": 5}, ...]

    Combines:
      - spaCy EntityRuler for MALWARE / APT_ACTOR + statistical ORG / PRODUCT
      - Regex for CVE / HASH_MD5 / HASH_SHA256 / IP_ADDR / DOMAIN
    """
    if not text or not text.strip():
        return []

    # Truncate to avoid spaCy max length issues (1 MB default)
    truncated = text[:500_000]

    nlp = _get_nlp()
    doc = nlp(truncated)

    counter: Counter[tuple[str, str]] = Counter()

    # --- spaCy entities (MALWARE, APT_ACTOR, ORG, PRODUCT, GPE) ---
    _KEEP_LABELS = {"MALWARE", "APT_ACTOR", "ORG", "PRODUCT"}
    for ent in doc.ents:
        if ent.label_ in _KEEP_LABELS:
            normalised = ent.text.strip()
            if len(normalised) >= 2:
                counter[(normalised, ent.label_)] += 1

    # --- CVE identifiers ---
    for match in _CVE_RE.finditer(truncated):
        counter[(match.group().upper(), "CVE")] += 1

    # --- SHA-256 hashes (check before MD5 to avoid 64-char MD5 false pos) ---
    for match in _SHA256_RE.finditer(truncated):
        counter[(match.group().lower(), "HASH_SHA256")] += 1

    # --- MD5 hashes (32-char hex NOT already counted as SHA-256) ---
    sha256_hits = {m.group().lower() for m in _SHA256_RE.finditer(truncated)}
    for match in _MD5_RE.finditer(truncated):
        value = match.group().lower()
        if value not in sha256_hits:
            counter[(value, "HASH_MD5")] += 1

    # --- IPv4 addresses ---
    for match in _IP_RE.finditer(truncated):
        counter[(match.group(), "IP_ADDR")] += 1

    # --- Domain names (skip IPs already captured) ---
    ip_hits = {m.group() for m in _IP_RE.finditer(truncated)}
    for match in _DOMAIN_RE.finditer(truncated):
        value = match.group().lower()
        if value not in ip_hits:
            counter[(value, "DOMAIN")] += 1

    return [
        {"text": text_val, "label": label, "count": count}
        for (text_val, label), count in counter.most_common(50)
    ]
