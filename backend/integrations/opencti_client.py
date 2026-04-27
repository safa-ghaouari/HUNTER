from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone

import requests

from backend.config import settings
from backend.models.enums import IocType
from backend.models.ioc import IoC


class OpenCTIClientError(RuntimeError):
    pass


def _pattern_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _indicator_pattern(ioc: IoC) -> tuple[str, str | None]:
    value = _pattern_escape(ioc.value_normalized)
    if ioc.type == IocType.URL:
        return "[url:value = '%s']" % value, "Url"
    if ioc.type == IocType.DOMAIN:
        return "[domain-name:value = '%s']" % value, "Domain-Name"
    if ioc.type == IocType.IP:
        return "[ipv4-addr:value = '%s']" % value, "IPv4-Addr"
    if ioc.type == IocType.EMAIL:
        return "[email-addr:value = '%s']" % value, "Email-Addr"
    if ioc.type == IocType.MD5:
        return "[file:hashes.MD5 = '%s']" % value, "File"
    if ioc.type == IocType.SHA1:
        return "[file:hashes.'SHA-1' = '%s']" % value, "File"
    if ioc.type == IocType.SHA256:
        return "[file:hashes.'SHA-256' = '%s']" % value, "File"
    if ioc.type == IocType.FILENAME:
        return "[file:name = '%s']" % value, "File"
    if ioc.type == IocType.CVE:
        return "[vulnerability:name = '%s']" % value, None
    return "[x-opencti-observable:value = '%s']" % value, "Unknown"


class OpenCTIClient:
    def __init__(self) -> None:
        self.base_url = settings.opencti_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {settings.opencti_token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "HUNTER-OpenCTI-Client/0.1",
            }
        )

    def graphql(self, query: str, variables: dict | None = None) -> dict:
        response = self.session.post(
            f"{self.base_url}/graphql",
            json={"query": query, "variables": variables or {}},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("errors"):
            raise OpenCTIClientError(str(payload["errors"]))
        return payload["data"]

    def create_external_reference(self, *, source_name: str, description: str | None, url: str | None) -> str:
        query = """
        mutation ExternalReferenceAdd($input: ExternalReferenceAddInput!) {
          externalReferenceAdd(input: $input) {
            id
          }
        }
        """
        variables = {
            "input": {
                "source_name": source_name,
                "description": description,
                "url": url,
            }
        }
        data = self.graphql(query, variables)
        return str(data["externalReferenceAdd"]["id"])

    def create_indicator(
        self,
        *,
        ioc: IoC,
        external_reference_ids: list[str] | None = None,
    ) -> str:
        pattern, observable_type = _indicator_pattern(ioc)
        indicator_type = "vulnerability" if ioc.type == IocType.CVE else "malicious-activity"
        query = """
        mutation IndicatorAdd($input: IndicatorAddInput!) {
          indicatorAdd(input: $input) {
            id
          }
        }
        """
        variables = {
            "input": {
                "name": f"{ioc.type.value.upper()} indicator: {ioc.value_normalized}",
                "description": ioc.description,
                "pattern_type": "stix",
                "pattern": pattern,
                "indicator_types": [indicator_type],
                "valid_from": datetime.now(timezone.utc).isoformat(),
                "confidence": ioc.confidence,
                "x_opencti_score": ioc.confidence,
                "x_opencti_detection": True,
                "externalReferences": external_reference_ids or [],
                "update": True,
                "createObservables": False,
            }
        }
        if observable_type:
            variables["input"]["x_opencti_main_observable_type"] = observable_type
        data = self.graphql(query, variables)
        return str(data["indicatorAdd"]["id"])

    def create_grouping(
        self,
        *,
        name: str,
        description: str,
        object_ids: list[str],
        external_reference_ids: list[str] | None = None,
    ) -> str:
        query = """
        mutation GroupingAdd($input: GroupingAddInput!) {
          groupingAdd(input: $input) {
            id
          }
        }
        """
        variables = {
            "input": {
                "name": name,
                "description": description,
                "context": "suspicious-activity",
                "confidence": 75,
                "objects": object_ids,
                "externalReferences": external_reference_ids or [],
                "update": True,
            }
        }
        data = self.graphql(query, variables)
        return str(data["groupingAdd"]["id"])


def sync_iocs_to_opencti(
    *,
    grouping_name: str,
    description: str,
    iocs: Iterable[IoC],
    external_references: list[dict[str, str | None]] | None = None,
) -> dict:
    client = OpenCTIClient()
    external_reference_ids: list[str] = []
    for reference in external_references or []:
        external_reference_ids.append(
            client.create_external_reference(
                source_name=str(reference["source_name"]),
                description=reference.get("description"),
                url=reference.get("url"),
            )
        )

    indicator_ids_by_key: dict[tuple[str, str], str] = {}
    indicator_ids: list[str] = []
    for ioc in iocs:
        indicator_id = client.create_indicator(
            ioc=ioc,
            external_reference_ids=external_reference_ids,
        )
        indicator_ids.append(indicator_id)
        indicator_ids_by_key[(ioc.type.value, ioc.value_normalized.lower())] = indicator_id

    grouping_id = client.create_grouping(
        name=grouping_name,
        description=description,
        object_ids=indicator_ids,
        external_reference_ids=external_reference_ids,
    )

    return {
        "grouping_id": grouping_id,
        "indicator_count": len(indicator_ids),
        "indicator_ids_by_key": indicator_ids_by_key,
        "external_reference_count": len(external_reference_ids),
    }
