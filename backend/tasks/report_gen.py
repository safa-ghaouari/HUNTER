"""Phase 6 — WeasyPrint PDF report generation task.

Generates a professional Threat Hunt PDF report from a completed HuntingJob
and uploads it to MinIO. Called inline from hunting_runner after the full
hunt pipeline completes, and also available as a standalone Celery task for
regenerating reports on demand.

Public API:
    generate_report_pdf(report_id, job_id) -> bytes
    run_report_gen_task.delay(str(report_id), str(job_id))
"""

from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import UUID

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.db.database import AsyncSessionLocal
from backend.models.alert import Alert
from backend.models.enums import JobStatus, JobType, ReportStatus, Severity
from backend.models.hunting_job import HuntingJob
from backend.models.ioc import IoC
from backend.models.report import Report
from backend.models.threat import Threat
from backend.storage.minio_client import upload_file
from backend.config import settings
from backend.tasks.celery_app import celery_app
from backend.tasks.loop_runner import run_async

_TEMPLATES_DIR = Path(__file__).parent.parent / "reports" / "templates"

_SEVERITY_ORDER = {
    "critical": 0,
    "high": 1,
    "medium": 2,
    "low": 3,
    "info": 4,
}


# ---------------------------------------------------------------------------
# Jinja2 environment
# ---------------------------------------------------------------------------

def _make_jinja_env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATES_DIR)),
        autoescape=select_autoescape(["html"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )
    return env


# ---------------------------------------------------------------------------
# Recommendation builder
# ---------------------------------------------------------------------------

def _build_recommendations(
    iocs: list[IoC],
    alerts: list[Alert],
    threats: list[Threat],
) -> list[dict]:
    recs: list[dict] = []

    critical_iocs = [i for i in iocs if i.severity.value == "critical"]
    high_iocs     = [i for i in iocs if i.severity.value == "high"]
    open_alerts   = [a for a in alerts if a.status.value == "open"]

    if critical_iocs:
        recs.append({
            "priority": 1,
            "title": "Immediately block critical-severity indicators",
            "body": (
                f"{len(critical_iocs)} critical-severity IoC(s) were identified. "
                "Add these to your perimeter firewall, DNS sinkholes, and EDR blocklists without delay. "
                "Verify no internal hosts have communicated with these indicators."
            ),
        })

    if open_alerts:
        recs.append({
            "priority": 1,
            "title": f"Triage {len(open_alerts)} open alert(s)",
            "body": (
                "Open alerts indicate potential matches between external threat indicators and "
                "your environment. Each alert should be investigated within 24 hours. "
                "Escalate to incident response if confirmed malicious activity is found."
            ),
        })

    if high_iocs:
        recs.append({
            "priority": 2,
            "title": "Review and action high-severity indicators",
            "body": (
                f"{len(high_iocs)} high-severity IoC(s) require prompt review. "
                "Block at network perimeter where operationally possible and monitor for related activity."
            ),
        })

    mitre_techniques = set()
    for threat in threats:
        mitre_techniques.update(threat.mitre_techniques or [])
    if mitre_techniques:
        recs.append({
            "priority": 2,
            "title": "Update detection rules for observed ATT&CK techniques",
            "body": (
                f"Techniques observed: {', '.join(sorted(mitre_techniques))}. "
                "Review your SIEM detection rules, EDR policies, and Sigma rule coverage "
                "to ensure these techniques are detected if executed in your environment."
            ),
        })

    recs.append({
        "priority": 3,
        "title": "Synchronise IoCs with MISP and OpenCTI",
        "body": (
            "Extracted indicators have been automatically pushed to the MISP instance and OpenCTI graph. "
            "Verify the sync completed successfully and share relevant IoCs with trusted communities "
            "under the applicable TLP level."
        ),
    })

    recs.append({
        "priority": 3,
        "title": "Schedule follow-up hunt in 7 days",
        "body": (
            "Threat landscapes evolve rapidly. A follow-up hunt on the same theme in one week "
            "will capture newly published indicators and validate that no missed activity has since surfaced."
        ),
    })

    return recs


# ---------------------------------------------------------------------------
# Core PDF generation
# ---------------------------------------------------------------------------

def _render_pdf(context: dict) -> bytes:
    from weasyprint import HTML, CSS  # imported here — heavy import, lazy-loaded

    env = _make_jinja_env()
    template = env.get_template("threat_hunt.html")
    html_content = template.render(**context)

    base_url = str(_TEMPLATES_DIR) + "/"
    pdf_bytes = HTML(string=html_content, base_url=base_url).write_pdf()
    return pdf_bytes


async def generate_report_pdf(report_id: UUID, job_id: UUID) -> bytes:
    """Load data, render template, generate PDF, upload to MinIO.

    Returns the raw PDF bytes. Updates the Report row in the database.
    """
    import asyncio

    async with AsyncSessionLocal() as session:
        # Load report + client + analyst
        report_stmt = (
            select(Report)
            .where(Report.id == report_id)
            .options(
                selectinload(Report.client),
                selectinload(Report.generated_by_user),
                selectinload(Report.hunting_job),
            )
        )
        report = (await session.execute(report_stmt)).scalar_one_or_none()
        if report is None:
            raise ValueError(f"Report {report_id} not found")

        # Load IoCs for the job, sorted by severity
        iocs_stmt = (
            select(IoC)
            .where(IoC.hunting_job_id == job_id)
            .options(selectinload(IoC.tags), selectinload(IoC.threats))
        )
        iocs: list[IoC] = list(
            (await session.execute(iocs_stmt)).scalars().all()
        )
        iocs.sort(key=lambda i: (_SEVERITY_ORDER.get(i.severity.value, 99), i.type.value))

        # Load alerts for the job
        alerts_stmt = (
            select(Alert)
            .where(Alert.hunting_job_id == job_id)
            .options(selectinload(Alert.asset))
        )
        alerts: list[Alert] = list(
            (await session.execute(alerts_stmt)).scalars().all()
        )
        alerts.sort(key=lambda a: _SEVERITY_ORDER.get(a.severity.value, 99))

        # Load threats for the job
        threats_stmt = (
            select(Threat)
            .where(Threat.hunting_job_id == job_id)
        )
        threats: list[Threat] = list(
            (await session.execute(threats_stmt)).scalars().all()
        )

        # Build stats
        crit_high = sum(1 for i in iocs if i.severity.value in ("critical", "high"))
        result = report.hunting_job.result_summary or {}
        nlp_data = result.get("nlp", {})

        stats = {
            "iocs_total":         len(iocs),
            "iocs_critical_high": crit_high,
            "alerts_total":       len(alerts),
            "assets_impacted":    result.get("matched_assets", 0),
            "sources_processed":  result.get("sources_processed", 0),
            "items_collected":    result.get("items_processed", 0),
        }

        # AI summary
        ai_summary: str = ""
        nlp_summary = nlp_data.get("summary", {})
        if isinstance(nlp_summary, dict):
            ai_summary = nlp_summary.get("summary", "")
        elif isinstance(nlp_summary, str):
            ai_summary = nlp_summary

        # NLP context for template
        nlp_ctx: dict = {}
        classification = nlp_data.get("classification", {})
        if classification:
            nlp_ctx["classification"] = classification
        ner = nlp_data.get("ner_entities", [])
        if ner:
            type_counts: dict[str, int] = {}
            for entity in ner:
                label = entity.get("label", "OTHER")
                type_counts[label] = type_counts.get(label, 0) + 1
            nlp_ctx["ner_summary"] = ", ".join(
                f"{count} {label}" for label, count in sorted(type_counts.items())
            )
        clusters = nlp_data.get("clusters", [])
        if clusters:
            nlp_ctx["cluster_count"] = len(clusters)

        theme = result.get("theme", report.title.replace(" Threat Hunt Report", ""))
        now = datetime.now(timezone.utc)

        context = {
            "report":       report,
            "report_id":    str(report.id)[:8].upper(),
            "job_id":       str(job_id)[:8].upper(),
            "client":       report.client,
            "theme":        theme,
            "analyst_email": report.generated_by_user.email if report.generated_by_user else "SOC Team",
            "generated_at": now.strftime("%d %B %Y, %H:%M UTC"),
            "period_start": report.period_start.strftime("%d %B %Y") if report.period_start else now.strftime("%d %B %Y"),
            "period_end":   report.period_end.strftime("%d %B %Y")   if report.period_end   else now.strftime("%d %B %Y"),
            "iocs":         iocs,
            "alerts":       alerts,
            "threats":      threats,
            "stats":        stats,
            "ai_summary":   ai_summary,
            "nlp":          nlp_ctx if nlp_ctx else None,
            "recommendations": _build_recommendations(iocs, alerts, threats),
        }

        # Render PDF in thread (WeasyPrint is synchronous/CPU-bound)
        pdf_bytes: bytes = await asyncio.to_thread(_render_pdf, context)

        # Upload to MinIO
        object_key = f"reports/{report.client_id}/{report.id}.pdf"
        upload_file(
            bucket=settings.minio_bucket,
            name=object_key,
            data=pdf_bytes,
            content_type="application/pdf",
        )

        # Update report record
        report.status = ReportStatus.READY
        report.minio_object_key = object_key
        report.file_size_bytes = len(pdf_bytes)
        await session.commit()

    return pdf_bytes


# ---------------------------------------------------------------------------
# Celery task (for on-demand regeneration)
# ---------------------------------------------------------------------------

@celery_app.task(name="backend.tasks.run_report_gen")
def run_report_gen_task(report_id: str, job_id: str) -> dict:
    async def _run():
        pdf_bytes = await generate_report_pdf(UUID(report_id), UUID(job_id))
        return {"status": "ok", "size_bytes": len(pdf_bytes)}

    return run_async(_run())
