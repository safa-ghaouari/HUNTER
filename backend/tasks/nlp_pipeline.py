"""Phase 3 — NLP pipeline Celery task.

Standalone task that can be dispatched independently to (re-)run the full
NLP pipeline on any existing HuntingJob:

    from backend.tasks.nlp_pipeline import run_nlp_pipeline_task
    run_nlp_pipeline_task.delay(str(job_id))

The task:
  1. Loads the job + its associated IoCs from PostgreSQL
  2. Reconstructs the collected entries from result_summary["preview_items"]
     (or uses seed_text if available)
  3. Runs: NER → SecBERT classification → sklearn clustering → RAG summary
  4. Writes results back to result_summary["nlp"] and updates the Threat
     description if a linked Threat exists

This module also exports run_nlp_for_job() — an async helper called inline
from hunting_runner.py so the NLP results are embedded in the same job
execution without a second Celery round-trip.
"""

from __future__ import annotations

import asyncio
from collections import Counter
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from sqlalchemy.orm.attributes import flag_modified

from backend.db.database import AsyncSessionLocal
from backend.models.enums import ThreatType
from backend.models.hunting_job import HuntingJob
from backend.models.ioc import IoC
from backend.services.llm_rag import generate_hunt_summary
from backend.services.nlp_classifier import classify_threat
from backend.services.nlp_clustering import cluster_iocs
from backend.services.nlp_ner import extract_cyber_entities
from backend.tasks.celery_app import celery_app
from backend.tasks.loop_runner import run_async

# ---------------------------------------------------------------------------
# SecBERT label → ThreatType mapping
# ---------------------------------------------------------------------------

_CLASSIFICATION_TO_THREAT_TYPE: dict[str, ThreatType] = {
    "ransomware":    ThreatType.MALWARE,
    "malware":       ThreatType.MALWARE,
    "apt":           ThreatType.ACTOR,
    "botnet":        ThreatType.MALWARE,
    "phishing":      ThreatType.CAMPAIGN,
    "vulnerability": ThreatType.TECHNIQUE,
    "supply_chain":  ThreatType.CAMPAIGN,
    "web_attack":    ThreatType.TECHNIQUE,
    "data_breach":   ThreatType.CAMPAIGN,
    "other":         ThreatType.CAMPAIGN,
}


# ---------------------------------------------------------------------------
# Core NLP orchestration (pure, no DB access)
# ---------------------------------------------------------------------------

def run_nlp_pipeline(
    *,
    theme: str,
    entries: list[dict],
    iocs: list[IoC],
) -> dict:
    """Run the full Phase 3 NLP pipeline and return a result dict.

    This function is pure (no I/O) — all DB work is done by the caller.
    """
    # --- Aggregate entry text for NER + classification ---
    full_text = "\n\n".join(
        f"{e.get('title', '')} {e.get('content', '')}" for e in entries
    )

    # 1. spaCy NER
    ner_entities: list[dict] = []
    try:
        ner_entities = extract_cyber_entities(full_text)
    except Exception as exc:
        ner_entities = [{"error": str(exc)}]

    # 2. SecBERT classification
    classification: dict = {}
    try:
        classification = classify_threat(full_text[:4000])
    except Exception as exc:
        classification = {"label": "other", "confidence": 0.0, "error": str(exc)}

    # 3. Sklearn clustering
    ioc_dicts = [
        {
            "type": ioc.type.value,
            "value_normalized": ioc.value_normalized,
            "description": ioc.description or "",
        }
        for ioc in iocs
    ]
    clustering: dict = {}
    try:
        clustering = cluster_iocs(ioc_dicts)
    except Exception as exc:
        clustering = {"error": str(exc)}

    # 4. IoC statistics (for RAG context + report)
    type_counter: Counter[str] = Counter(ioc.type.value for ioc in iocs)
    ioc_stats = {
        "total": len(iocs),
        "by_type": dict(type_counter),
    }

    # 5. LangChain + Ollama RAG summary
    rag_result: dict = {}
    try:
        rag_result = generate_hunt_summary(
            theme=theme,
            entries=entries,
            ioc_stats=ioc_stats,
            ner_entities=[e for e in ner_entities if "error" not in e],
            classification=classification,
        )
    except Exception as exc:
        rag_result = {"summary": "", "source": "error", "error": str(exc)}

    return {
        "ner_entities": ner_entities,
        "classification": classification,
        "clustering": clustering,
        "ioc_stats": ioc_stats,
        "rag": rag_result,
        "threat_type": _CLASSIFICATION_TO_THREAT_TYPE.get(
            classification.get("label", "other"), ThreatType.CAMPAIGN
        ).value,
    }


# ---------------------------------------------------------------------------
# Async DB helper — called inline from hunting_runner
# ---------------------------------------------------------------------------

async def run_nlp_for_job(
    session,
    *,
    job: HuntingJob,
    entries: list[dict],
    iocs: list[IoC],
    theme: str,
) -> dict:
    """Run the NLP pipeline and persist results onto *job*.

    Updates:
      - job.result_summary["nlp"]
      - The first linked Threat's type + description (if present)
    """
    nlp_result = await asyncio.to_thread(
        run_nlp_pipeline,
        theme=theme,
        entries=entries,
        iocs=iocs,
    )

    # Persist NLP block onto the job's result_summary
    summary = dict(job.result_summary or {})
    summary["nlp"] = nlp_result
    job.result_summary = summary
    flag_modified(job, "result_summary")

    # Update the linked Threat if available
    from backend.models.threat import Threat

    stmt = (
        select(Threat)
        .where(Threat.hunting_job_id == job.id)
        .limit(1)
    )
    threat = (await session.execute(stmt)).scalar_one_or_none()
    if threat is not None:
        # Update threat type based on SecBERT classification
        new_type_value = nlp_result.get("threat_type", ThreatType.CAMPAIGN.value)
        try:
            threat.type = ThreatType(new_type_value)
        except ValueError:
            pass

        # Prepend RAG summary to threat description
        rag_summary = nlp_result.get("rag", {}).get("summary", "")
        if rag_summary:
            threat.description = rag_summary

    await session.flush()
    return nlp_result


# ---------------------------------------------------------------------------
# Standalone Celery task — re-run NLP on an existing job
# ---------------------------------------------------------------------------

@celery_app.task(name="backend.tasks.run_nlp_pipeline", bind=True)
def run_nlp_pipeline_task(self, job_id: str) -> dict:
    """Re-run the NLP pipeline for an existing HuntingJob."""

    async def _execute() -> dict:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(HuntingJob)
                .options(selectinload(HuntingJob.iocs))
                .where(HuntingJob.id == UUID(job_id))
            )
            job = (await session.execute(stmt)).scalar_one_or_none()
            if job is None:
                return {"error": f"Job {job_id} not found"}

            iocs: list[IoC] = list(job.iocs)
            theme = str(job.params.get("theme") or "threat activity")

            # Reconstruct entries from result_summary preview (best effort)
            preview = (job.result_summary or {}).get("preview_items", [])
            seed_text = str(job.params.get("seed_text") or "")
            entries: list[dict] = list(preview)
            if seed_text:
                entries.insert(0, {
                    "source_name": "seed_text",
                    "title": "Manual hunt input",
                    "content": seed_text,
                })

            result = await run_nlp_for_job(
                session,
                job=job,
                entries=entries,
                iocs=iocs,
                theme=theme,
            )
            await session.commit()
            return result

    result = run_async(_execute())
    result["celery_task_id"] = self.request.id
    return result
