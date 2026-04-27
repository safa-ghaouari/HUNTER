import asyncio
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from backend.config import settings
from backend.db.database import AsyncSessionLocal
from backend.models.enums import JobStatus, JobType, ReportStatus, ReportType, Severity, ThreatType
from backend.models.hunting_job import HuntingJob
from backend.models.ioc import IoC
from backend.models.report import Report
from backend.models.source import Source
from backend.models.threat import Threat
from backend.storage.minio_client import upload_file
from backend.services.correlation import correlate_iocs_for_client
from backend.services.intelligence_sync import sync_collection_iocs
from backend.services.ioc_extraction import extract_iocs
from backend.services.source_collection import collect_source_entries
from backend.tasks.nlp_pipeline import run_nlp_for_job


def _build_pdf(title: str, summary_lines: list[str]) -> bytes:
    escaped_title = title.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    body_lines = [escaped_title, *summary_lines]
    content_parts = ["BT", "/F1 18 Tf", "72 740 Td", f"({body_lines[0]}) Tj"]
    current_y = 712
    for line in body_lines[1:]:
        escaped_line = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        content_parts.extend(["/F1 12 Tf", f"72 {current_y} Td", f"({escaped_line}) Tj"])
        current_y -= 20
    content_parts.append("ET")
    content = "\n".join(content_parts).encode("utf-8")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
        f"4 0 obj\n<< /Length {len(content)} >>\nstream\n".encode("utf-8") + content + b"\nendstream\nendobj\n",
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj)

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("utf-8"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("utf-8"))
    pdf.extend(
        (
            f"trailer\n<< /Root 1 0 R /Size {len(objects) + 1} >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("utf-8")
    )
    return bytes(pdf)


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

    async def _fetch_source(source):
        try:
            source_entries, source_notes = await asyncio.to_thread(collect_source_entries, source)
            return source, source_entries, source_notes, None
        except Exception as exc:
            return source, [], [], exc

    results = await asyncio.gather(*[_fetch_source(s) for s in sources])

    for source, source_entries, source_notes, error in results:
        if error:
            notes.append(f"source '{source.name}' failed: {error}")
            continue
        notes.extend(source_notes)
        if not source_entries:
            notes.append(f"source '{source.name}' returned no entries")
            continue
        source.last_polled_at = datetime.now(timezone.utc)
        entries.extend(source_entries)
        notes.append(f"source '{source.name}' returned {len(source_entries)} entries")

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

        summary_lines = [
            f"Theme: {theme}",
            f"Sources used: {', '.join(sorted(source_names))}",
            f"Collected entries: {len(entries)}",
            f"IoCs extracted: {len(deduplicated_iocs)}",
            f"Alerts created: {alerts_created}",
            f"Assets impacted: {impacted_assets}",
        ]
        pdf_bytes = _build_pdf(report.title, summary_lines)
        object_key = f"reports/{job.client_id}/{report.id}.pdf"
        upload_file(
            bucket=settings.minio_bucket,
            name=object_key,
            data=pdf_bytes,
            content_type="application/pdf",
        )
        report.status = ReportStatus.READY
        report.minio_object_key = object_key
        report.file_size_bytes = len(pdf_bytes)
        report_id = str(report.id)

    job.result_summary = {
        "theme": theme,
        "sources_processed": len(source_names),
        "items_processed": len(entries),
        "iocs_extracted": len(deduplicated_iocs),
        "alerts_created": alerts_created,
        "matched_assets": impacted_assets,
        "report_id": report_id,
        "notes": notes,
        "nlp": nlp_result,
        **sync_summary,
    }
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
