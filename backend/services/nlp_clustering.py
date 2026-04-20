"""Phase 3 — Scikit-learn IoC clustering and anomaly detection.

Three algorithms applied to the extracted IoC set:

  K-Means   — groups IoCs into k semantic clusters based on TF-IDF text
               similarity.  k is auto-selected via the elbow method
               (inertia drop-off) bounded between 2 and MAX_K.

  DBSCAN    — density-based clustering that does not require a fixed k.
               Useful for discovering tightly packed indicator groups
               while labelling sparse outliers as noise (-1).

  Isolation Forest — unsupervised anomaly detection on the same TF-IDF
               feature matrix.  IoCs that are unusually rare in the
               feature space receive an anomaly score close to -1.

Public API:
    cluster_iocs(iocs: list[dict]) -> dict
    # {
    #   "kmeans": [{"cluster_id": 0, "size": 12, "top_terms": [...], "ioc_indices": [...]}, ...],
    #   "dbscan": {"n_clusters": 3, "n_noise": 2, "labels": [0, 1, -1, ...]},
    #   "anomalies": {"ioc_indices": [3, 7], "scores": [-0.12, -0.18]},
    #   "n_iocs": 42
    # }
"""

from __future__ import annotations

import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import silhouette_score

_MAX_K = 8          # upper bound for k-means clusters
_MIN_IOCS = 4       # minimum IoCs needed to run any clustering
_ANOMALY_CONTAMINATION = 0.1   # expected fraction of anomalies


def _build_corpus(iocs: list[dict]) -> list[str]:
    """Build one text document per IoC combining type, value and description."""
    docs = []
    for ioc in iocs:
        parts = [
            str(ioc.get("type", "")),
            str(ioc.get("value_normalized", ioc.get("value", ""))),
            str(ioc.get("description", "")),
        ]
        docs.append(" ".join(p for p in parts if p).strip())
    return docs


def _auto_k(matrix, max_k: int) -> int:
    """Select k using the elbow method on K-Means inertia."""
    n = matrix.shape[0]
    upper = min(max_k, n - 1)
    if upper < 2:
        return 2

    inertias: list[float] = []
    for k in range(2, upper + 1):
        km = KMeans(n_clusters=k, random_state=42, n_init="auto")
        km.fit(matrix)
        inertias.append(float(km.inertia_))

    # Elbow: largest second-difference (curvature) in the inertia curve
    if len(inertias) < 3:
        return 2

    diffs = np.diff(inertias)
    curvature = np.diff(diffs)
    best_k = int(np.argmin(curvature)) + 3   # offset: argmin on 2nd diff starts at k=3
    return max(2, min(best_k, upper))


def _run_kmeans(matrix, corpus: list[str], vectorizer: TfidfVectorizer) -> list[dict]:
    """K-Means clustering with auto k selection."""
    n = matrix.shape[0]
    k = _auto_k(matrix, min(_MAX_K, n - 1))
    km = KMeans(n_clusters=k, random_state=42, n_init="auto")
    labels = km.fit_predict(matrix)

    feature_names = np.array(vectorizer.get_feature_names_out())
    clusters: list[dict] = []

    for cluster_id in range(k):
        indices = [i for i, lbl in enumerate(labels) if lbl == cluster_id]
        if not indices:
            continue

        # Top TF-IDF terms for this cluster centroid
        centroid = km.cluster_centers_[cluster_id]
        top_term_indices = centroid.argsort()[::-1][:8]
        top_terms = feature_names[top_term_indices].tolist()

        clusters.append({
            "cluster_id": cluster_id,
            "size": len(indices),
            "top_terms": top_terms,
            "ioc_indices": indices,
        })

    return sorted(clusters, key=lambda c: c["size"], reverse=True)


def _run_dbscan(matrix) -> dict:
    """DBSCAN clustering — no fixed k required."""
    db = DBSCAN(eps=0.5, min_samples=2, metric="cosine")
    labels = db.fit_predict(matrix.toarray())
    unique_labels = set(labels)
    n_noise = int((labels == -1).sum())
    n_clusters = len(unique_labels - {-1})
    return {
        "n_clusters": n_clusters,
        "n_noise": n_noise,
        "labels": labels.tolist(),
    }


def _run_isolation_forest(matrix) -> dict:
    """Isolation Forest anomaly detection."""
    n = matrix.shape[0]
    contamination = min(_ANOMALY_CONTAMINATION, (n - 1) / n)
    iso = IsolationForest(
        n_estimators=100,
        contamination=contamination,
        random_state=42,
    )
    # decision_function: the lower, the more anomalous
    scores = iso.fit(matrix.toarray()).decision_function(matrix.toarray())
    predictions = iso.predict(matrix.toarray())   # -1 = anomaly, 1 = normal

    anomaly_indices = [i for i, p in enumerate(predictions) if p == -1]
    anomaly_scores = [round(float(scores[i]), 4) for i in anomaly_indices]

    return {
        "ioc_indices": anomaly_indices,
        "scores": anomaly_scores,
        "total_anomalies": len(anomaly_indices),
    }


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def cluster_iocs(iocs: list[dict]) -> dict:
    """Run K-Means, DBSCAN and Isolation Forest on *iocs*.

    Each IoC dict must have at minimum: ``type``, ``value_normalized``
    (or ``value``), and optionally ``description``.

    Returns a result dict with keys: ``kmeans``, ``dbscan``, ``anomalies``,
    ``n_iocs``.  On any error returns an ``error`` key instead.
    """
    n = len(iocs)
    if n < _MIN_IOCS:
        return {
            "n_iocs": n,
            "kmeans": [],
            "dbscan": {"n_clusters": 0, "n_noise": n, "labels": []},
            "anomalies": {"ioc_indices": [], "scores": [], "total_anomalies": 0},
            "skipped": f"need at least {_MIN_IOCS} IoCs, got {n}",
        }

    try:
        corpus = _build_corpus(iocs)

        vectorizer = TfidfVectorizer(
            max_features=500,
            sublinear_tf=True,
            min_df=1,
            token_pattern=r"[a-zA-Z0-9\.\-_]{2,}",
        )
        matrix = vectorizer.fit_transform(corpus)

        return {
            "n_iocs": n,
            "kmeans": _run_kmeans(matrix, corpus, vectorizer),
            "dbscan": _run_dbscan(matrix),
            "anomalies": _run_isolation_forest(matrix),
        }

    except Exception as exc:
        return {
            "n_iocs": n,
            "kmeans": [],
            "dbscan": {"n_clusters": 0, "n_noise": 0, "labels": []},
            "anomalies": {"ioc_indices": [], "scores": [], "total_anomalies": 0},
            "error": str(exc),
        }
