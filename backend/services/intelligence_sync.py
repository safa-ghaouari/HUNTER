from __future__ import annotations

from collections.abc import Iterable

from backend.integrations.misp_client import create_misp_event_with_iocs
from backend.integrations.opencti_client import sync_iocs_to_opencti
from backend.models.ioc import IoC


def _ioc_key(ioc: IoC) -> tuple[str, str]:
    return ioc.type.value, ioc.value_normalized.lower()


def sync_collection_iocs(
    *,
    title: str,
    description: str,
    entries: list[dict[str, str]],
    iocs: Iterable[IoC],
) -> dict:
    ioc_list = list(iocs)
    summary = {
        "misp_event_id": None,
        "misp_event_uuid": None,
        "misp_attributes_added": 0,
        "misp_error": None,
        "opencti_grouping_id": None,
        "opencti_indicators_created": 0,
        "opencti_external_references_created": 0,
        "opencti_error": None,
    }

    try:
        misp_result = create_misp_event_with_iocs(title=title, iocs=ioc_list)
        summary.update(
            {
                "misp_event_id": misp_result["event_id"],
                "misp_event_uuid": misp_result["event_uuid"],
                "misp_attributes_added": misp_result["attributes_added"],
            }
        )
        for ioc in ioc_list:
            ioc.misp_event_id = misp_result["event_uuid"]
    except Exception as exc:
        summary["misp_error"] = str(exc)

    external_references = []
    seen_references: set[tuple[str, str]] = set()
    for entry in entries:
        link = str(entry.get("link") or "").strip()
        source_name = str(entry.get("source_name") or "HUNTER")
        if not link or link.startswith("file://"):
            continue
        key = (source_name, link)
        if key in seen_references:
            continue
        seen_references.add(key)
        external_references.append(
            {
                "source_name": source_name,
                "description": entry.get("title") or source_name,
                "url": link,
            }
        )

    try:
        opencti_result = sync_iocs_to_opencti(
            grouping_name=title,
            description=description,
            iocs=ioc_list,
            external_references=external_references,
        )
        indicator_ids_by_key = opencti_result["indicator_ids_by_key"]
        for ioc in ioc_list:
            ioc.opencti_id = indicator_ids_by_key.get(_ioc_key(ioc))

        summary.update(
            {
                "opencti_grouping_id": opencti_result["grouping_id"],
                "opencti_indicators_created": opencti_result["indicator_count"],
                "opencti_external_references_created": opencti_result["external_reference_count"],
            }
        )
    except Exception as exc:
        summary["opencti_error"] = str(exc)

    return summary
