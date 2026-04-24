import asyncio
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from backend.db.database import AsyncSessionLocal
from backend.models.enums import JobStatus, JobType, ReportStatus, ReportType, Severity, ThreatType
from backend.models.hunting_job import HuntingJob
from backend.models.ioc import IoC
from backend.models.report import Report
from backend.models.source import Source
from backend.models.threat import Threat
from backend.services.correlation import correlate_iocs_for_client
from backend.services.intelligence_sync import sync_collection_iocs
from backend.services.ioc_extraction import extract_iocs
from backend.services.source_collection import collect_source_entries
from backend.tasks.nlp_pipeline import run_nlp_for_job

_SOURCE_AUTO_DISABLE_FAILURE_THRESHOLD = 5
_SOURCE_ERROR_MESSAGE_LIMIT = 1000


def _truncate_source_error(message: str) -> str:
    message = message.strip()
    if len(message) <= _SOURCE_ERROR_MESSAGE_LIMIT:
        return message
    return f"{message[:_SOURCE_ERROR_MESSAGE_LIMIT - 3]}..."


def _record_source_success(source: Source, completed_at: datetime) -> None:
    source.last_attempted_at = completed_at
    source.last_polled_at = completed_at
    source.last_failed_at = None
    source.consecutive_failures = 0
    source.last_error_message = None


def _record_source_failure(source: Source, *, error: Exception, failed_at: datetime) -> str:
    source.last_attempted_at = failed_at
    source.last_failed_at = failed_at
    source.consecutive_failures = (source.consecutive_failures or 0) + 1

    error_message = _truncate_source_error(str(error) or error.__class__.__name__)
    source.last_error_message = error_message

    if source.consecutive_failures >= _SOURCE_AUTO_DISABLE_FAILURE_THRESHOLD:
        source.is_active = False
        source.last_error_message = (
            f"Auto-disabled after {source.consecutive_failures} consecutive collection failures. "
            f"Last error: {error_message}"
        )
        return (
            f"source '{source.name}' auto-disabled after "
            f"{source.consecutive_failures} consecutive failures: {error_message}"
        )

    return (
        f"source '{source.name}' failed "
        f"({source.consecutive_failures} consecutive failure(s)): {error_message}"
    )


async def _resolve_entries(job: HuntingJob, session) -> tuple[list[dict[str, str]], list[str]]:
    entries: list[dict[str, str]] = []
    notes: list[str] = []

    seed_text = str(job.params.get("seed_text") or "").strip()
    if seed_text:
        entries.append(
            {
                "source_name": "seed_text",
                "source_type": "manual",
                "content": seed_text,
                "title": "Manual hunt input",
            }
        )
        notes.append("manual input processed")

    statement = select(Source).where(Source.is_active.is_(True))
    if job.source_id is not None:
        statement = statement.where(Source.id == job.source_id)
    sources = (await session.execute(statement.order_by(Source.created_at.desc()))).scalars().all()

    attempt_started_at = datetime.now(timezone.utc)
    for source in sources:
        source.last_attempted_at = attempt_started_at
    if sources:
        await session.commit()

    async def _fetch_source(source):
        try:
            source_entries, source_notes = await asyncio.to_thread(collect_source_entries, source)
            return source, source_entries, source_notes, None
        except Exception as exc:
            return source, [], [], exc

    results = await asyncio.gather(*[_fetch_source(s) for s in sources])

    for source, source_entries, source_notes, error in results:
        completed_at = datetime.now(timezone.utc)
        if error:
            notes.append(_record_source_failure(source, error=error, failed_at=completed_at))
            continue
        notes.extend(source_notes)
        if not source_entries:
            notes.append(f"source '{source.name}' returned no entries")
            _record_source_success(source, completed_at)
            continue
        _record_source_success(source, completed_at)
        entries.extend(source_entries)
        notes.append(f"source '{source.name}' returned {len(source_entries)} entries")

    if sources:
        await session.commit()

    return entries, notes


def _deduplicate_iocs(extracted_iocs: list[IoC]) -> list[IoC]:
    unique_ioc_keys: set[tuple[str, str]] = set()
    deduplicated_iocs: list[IoC] = []
    for ioc in extracted_iocs:
        key = (ioc.type.value, ioc.value_normalized.lower())
        if key in unique_ioc_keys:
            continue
        unique_ioc_keys.add(key)
        deduplicated_iocs.append(ioc)
    return deduplicated_iocs


async def _run_collection_job(job: HuntingJob, session, entries: list[dict[str, str]], notes: list[str]) -> None:
    source_names = sorted({entry["source_name"] for entry in entries})
    extracted_iocs: list[IoC] = []
    for entry in entries:
        description_prefix = f"{entry['source_name']} :: {entry['title']}"
        for extracted in extract_iocs(
            text=entry["content"],
            source_type=entry["source_type"],
            description_prefix=description_prefix,
        ):
            extracted_iocs.append(
                IoC(
                    type=extracted["type"],
                    value=extracted["value"],
                    value_normalized=extracted["value_normalized"],
                    severity=extracted["severity"],
                    confidence=extracted["confidence"],
                    tlp=extracted["tlp"],
                    source_type=extracted["source_type"],
                    description=extracted["description"],
                    hunting_job_id=job.id,
                )
            )

    deduplicated_iocs = _deduplicate_iocs(extracted_iocs)
    sync_summary = {}
    if deduplicated_iocs:
        session.add_all(deduplicated_iocs)
        await session.flush()

        collection_title = f"HUNTER Collection {str(job.id)[:8]}"
        sync_summary = await asyncio.to_thread(
            sync_collection_iocs,
            title=collection_title,
            description=f"Collected from {len(source_names)} source(s) and {len(entries)} item(s).",
            entries=entries,
            iocs=deduplicated_iocs,
        )
        await session.flush()

    preview_items = [
        {
            "source_name": entry["source_name"],
            "title": entry["title"],
            "link": entry.get("link"),
        }
        for entry in entries[:10]
    ]

    job.result_summary = {
        "sources_processed": len(source_names),
        "items_processed": len(entries),
        "iocs_extracted": len(deduplicated_iocs),
        "preview_items": preview_items,
        "notes": notes,
        **sync_summary,
    }
    flag_modified(job, "result_summary")


async def _run_full_hunt_job(job: HuntingJob, session, entries: list[dict[str, str]], notes: list[str]) -> None:
    theme = str(job.params.get("theme") or "threat activity").strip() or "threat activity"
    extracted_iocs: list[IoC] = []
    source_names: set[str] = set()

    for entry in entries:
        source_names.add(entry["source_name"])
        description_prefix = f"{entry['source_name']} :: {entry['title']}"
        for extracted in extract_iocs(
            text=entry["content"],
            source_type=entry["source_type"],
            description_prefix=description_prefix,
        ):
            extracted_iocs.append(
                IoC(
                    type=extracted["type"],
                    value=extracted["value"],
                    value_normalized=extracted["value_normalized"],
                    severity=extracted["severity"],
                    confidence=extracted["confidence"],
                    tlp=extracted["tlp"],
                    source_type=extracted["source_type"],
                    description=extracted["description"],
                    hunting_job_id=job.id,
                )
            )

    deduplicated_iocs = _deduplicate_iocs(extracted_iocs)
    if not deduplicated_iocs:
        raise ValueError("The hunt ran successfully but no IoCs were extracted from the collected content.")

    session.add_all(deduplicated_iocs)
    await session.flush()

    sync_summary = await asyncio.to_thread(
        sync_collection_iocs,
        title=f"{theme.title()} Collection {str(job.id)[:8]}",
        description=f"Full hunt collection sync for theme '{theme}'.",
        entries=entries,
        iocs=deduplicated_iocs,
    )

    threat = Threat(
        name=f"{theme.title()} Intelligence Cluster {str(job.id)[:8]}",
        type=ThreatType.CAMPAIGN,
        description=f"Real collection cluster generated from {len(entries)} collected items.",
        mitre_techniques=["T1566.001"],
        severity=Severity.MEDIUM,
        hunting_job_id=job.id,
        iocs=deduplicated_iocs,
    )
    session.add(threat)
    await session.flush()

    # --- Phase 3: NLP pipeline (NER + SecBERT + clustering + RAG) ---
    nlp_result: dict = {}
    try:
        nlp_result = await run_nlp_for_job(
            session,
            job=job,
            entries=entries,
            iocs=deduplicated_iocs,
            theme=theme,
        )
    except Exception as nlp_exc:
        nlp_result = {"error": str(nlp_exc)}

    report_id = None
    alerts_created = 0
    impacted_assets = 0
    if job.client_id is not None:
        created_alerts = await correlate_iocs_for_client(
            session,
            client_id=job.client_id,
            hunting_job_id=job.id,
            iocs=deduplicated_iocs,
            threat=threat,
        )
        alerts_created = len(created_alerts)
        impacted_assets = len({alert.asset_id for alert in created_alerts if alert.asset_id is not None})

        report = Report(
            client_id=job.client_id,
            hunting_job_id=job.id,
            generated_by=job.initiated_by,
            report_type=ReportType.THREAT_HUNT,
            title=f"{theme.title()} Threat Hunt Report",
            period_start=date.today(),
            period_end=date.today(),
            status=ReportStatus.GENERATING,
        )
        session.add(report)
        await session.flush()

        # Commit current job state so report_gen can read it back
        job.result_summary = {
            "theme": theme,
            "sources_processed": len(source_names),
            "items_processed": len(entries),
            "iocs_extracted": len(deduplicated_iocs),
            "alerts_created": alerts_created,
            "matched_assets": impacted_assets,
            "notes": notes,
            "nlp": nlp_result,
            **sync_summary,
        }
        flag_modified(job, "result_summary")
        await session.commit()

        from backend.tasks.report_gen import generate_report_pdf
        try:
            await generate_report_pdf(report.id, job.id)
        except Exception as pdf_exc:
            report.status = ReportStatus.FAILED
            await session.commit()
            raise RuntimeError(f"PDF generation failed: {pdf_exc}") from pdf_exc

        report_id = str(report.id)

    # Append report_id now that generation is complete
    if job.result_summary is not None:
        job.result_summary["report_id"] = report_id
        flag_modified(job, "result_summary")


async def run_hunting_job(job_id: UUID) -> None:
    async with AsyncSessionLocal() as session:
        statement = select(HuntingJob).where(HuntingJob.id == job_id)
        job = (await session.execute(statement)).scalar_one_or_none()
        if job is None:
            return

        try:
            job.status = JobStatus.RUNNING
            job.started_at = datetime.now(timezone.utc)
            job.error_message = None
            await session.commit()

            entries, notes = await _resolve_entries(job, session)
            if not entries:
                detail = " ; ".join(notes) if notes else "no collection notes available"
                raise ValueError(
                    "No hunt input available. Provide seed_text or configure active RSS sources. "
                    f"Collector notes: {detail}"
                )
            if job.type == JobType.COLLECTION:
                await _run_collection_job(job, session, entries, notes)
            elif job.type == JobType.FULL_HUNT:
                await _run_full_hunt_job(job, session, entries, notes)
            else:
                raise ValueError(f"Job type '{job.type.value}' is not implemented yet.")

            job.status = JobStatus.SUCCESS
            job.finished_at = datetime.now(timezone.utc)
            await session.commit()
        except Exception as exc:
            await session.rollback()
            failure_statement = select(HuntingJob).where(HuntingJob.id == job_id)
            failed_job = (await session.execute(failure_statement)).scalar_one_or_none()
            if failed_job is None:
                return

            failed_job.status = JobStatus.FAILED
            failed_job.result_summary = failed_job.result_summary or {}
            failed_job.error_message = str(exc)
            failed_job.finished_at = datetime.now(timezone.utc)
            await session.commit()


async def run_mock_hunt(job_id: UUID) -> None:
    await run_hunting_job(job_id)
