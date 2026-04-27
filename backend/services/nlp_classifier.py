"""Phase 3 — SecBERT threat-content classifier.

Uses jackaduma/SecBERT (a BERT model pre-trained on cybersecurity corpora)
as a sentence encoder.  Classification is performed via cosine similarity
between the input embedding and pre-computed embeddings of each threat
category's canonical description — a standard zero-shot approach.

Threat categories (aligned with hunter.md / MISP taxonomy):
  ransomware, malware, phishing, vulnerability, apt,
  botnet, data_breach, supply_chain, web_attack, other

Lazy singleton: the model (~440 MB) is downloaded on first call and cached
in the HuggingFace default cache directory (/root/.cache/huggingface).

Public API:
    classify_threat(text: str) -> dict
    # {"label": "ransomware", "confidence": 0.87,
    #  "all_scores": {"ransomware": 0.87, "malware": 0.06, ...}}
"""

from __future__ import annotations

import threading
from typing import Optional

import numpy as np

# ---------------------------------------------------------------------------
# Threat category definitions
# Each description is a dense bag-of-keywords that SecBERT understands well
# ---------------------------------------------------------------------------

_THREAT_CATEGORIES: dict[str, str] = {
    "ransomware": (
        "ransomware file encryption ransom payment bitcoin extortion "
        "decrypt locker double extortion data leak publish victims"
    ),
    "malware": (
        "malware trojan backdoor dropper loader stager implant "
        "remote access tool RAT keylogger stealer infostealer spyware wiper"
    ),
    "phishing": (
        "phishing spear phishing credential harvesting social engineering "
        "email lure fake login password theft impersonation business email compromise BEC"
    ),
    "vulnerability": (
        "vulnerability CVE exploit zero-day patch buffer overflow "
        "use after free memory corruption injection privilege escalation RCE"
    ),
    "apt": (
        "advanced persistent threat nation state espionage lateral movement "
        "exfiltration long term access living off the land LOLBAS supply chain"
    ),
    "botnet": (
        "botnet command and control C2 DDoS distributed denial of service "
        "zombie infected machines Mirai Emotet infrastructure takedown"
    ),
    "data_breach": (
        "data breach leak exfiltration sensitive personal information PII "
        "database dump credentials exposed records sold dark web"
    ),
    "supply_chain": (
        "supply chain compromise software update build system third party "
        "vendor SolarWinds backdoor malicious package dependency confusion"
    ),
    "web_attack": (
        "web application attack SQL injection XSS CSRF cross-site scripting "
        "SSRF path traversal authentication bypass API exploitation"
    ),
    "other": (
        "security incident threat intelligence indicator of compromise "
        "cyber threat alert detection response general advisory"
    ),
}

_MODEL_NAME = "jackaduma/SecBERT"

# ---------------------------------------------------------------------------
# Lazy singleton — model + tokenizer loaded once, thread-safe
# ---------------------------------------------------------------------------

_model = None
_tokenizer = None
_category_embeddings: Optional[np.ndarray] = None
_category_labels: list[str] = list(_THREAT_CATEGORIES.keys())
_model_lock = threading.Lock()


def _mean_pooling(model_output, attention_mask) -> "torch.Tensor":
    """Mean-pool token embeddings weighted by the attention mask."""
    import torch
    token_embeddings = model_output[0]
    mask_expanded = (
        attention_mask.unsqueeze(-1)
        .expand(token_embeddings.size())
        .float()
    )
    return torch.sum(token_embeddings * mask_expanded, 1) / torch.clamp(
        mask_expanded.sum(1), min=1e-9
    )


def _encode(texts: list[str], tokenizer, model) -> np.ndarray:
    """Encode a list of texts → L2-normalised embeddings (numpy)."""
    import torch

    encoded = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=512,
        return_tensors="pt",
    )
    with torch.no_grad():
        output = model(**encoded)

    embeddings = _mean_pooling(output, encoded["attention_mask"])
    # L2-normalise for cosine similarity via dot product
    norms = embeddings.norm(dim=1, keepdim=True).clamp(min=1e-9)
    normalised = (embeddings / norms).cpu().numpy()
    return normalised


def _load_model():
    global _model, _tokenizer, _category_embeddings

    from transformers import AutoModel, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(_MODEL_NAME)
    model = AutoModel.from_pretrained(_MODEL_NAME)
    model.eval()

    # Pre-compute category embeddings
    descriptions = [_THREAT_CATEGORIES[label] for label in _category_labels]
    cat_embeddings = _encode(descriptions, tokenizer, model)

    _tokenizer = tokenizer
    _model = model
    _category_embeddings = cat_embeddings


def _get_model():
    global _model, _tokenizer, _category_embeddings
    if _model is None:
        with _model_lock:
            if _model is None:
                _load_model()
    return _tokenizer, _model, _category_embeddings


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def classify_threat(text: str) -> dict:
    """Classify *text* into a threat category using SecBERT embeddings.

    Returns:
        {
            "label": "ransomware",
            "confidence": 0.87,
            "all_scores": {"ransomware": 0.87, "malware": 0.06, ...}
        }

    On any failure (model unavailable, torch error) returns the "other"
    category with confidence 0.0 and records the error in the result.
    """
    if not text or not text.strip():
        return {"label": "other", "confidence": 0.0, "all_scores": {}, "error": "empty input"}

    try:
        tokenizer, model, category_embeddings = _get_model()
        text_embedding = _encode([text[:2000]], tokenizer, model)  # truncate for speed

        # Cosine similarity = dot product of L2-normalised vectors
        scores: np.ndarray = (text_embedding @ category_embeddings.T)[0]

        # Softmax to convert similarities into a probability distribution
        exp_scores = np.exp(scores - scores.max())
        probabilities = exp_scores / exp_scores.sum()

        best_idx = int(probabilities.argmax())
        all_scores = {
            label: round(float(probabilities[i]), 4)
            for i, label in enumerate(_category_labels)
        }

        return {
            "label": _category_labels[best_idx],
            "confidence": round(float(probabilities[best_idx]), 4),
            "all_scores": all_scores,
        }

    except Exception as exc:
        # Graceful degradation — pipeline must not fail the whole hunting job
        return {
            "label": "other",
            "confidence": 0.0,
            "all_scores": {},
            "error": str(exc),
        }
