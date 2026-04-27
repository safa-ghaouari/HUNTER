from functools import lru_cache
from uuid import UUID

from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

from backend.config import settings
from backend.models.enums import IocType

_IOC_FIELD_MAP = {
    IocType.IP: "observed_ips",
    IocType.DOMAIN: "observed_domains",
    IocType.URL: "observed_urls",
    IocType.MD5: "observed_hashes",
    IocType.SHA1: "observed_hashes",
    IocType.SHA256: "observed_hashes",
    IocType.EMAIL: "observed_emails",
    IocType.CVE: "observed_cves",
}


def client_logs_index_name(client_id: UUID) -> str:
    return f"hunter-client-logs-{str(client_id).replace('-', '')}"


@lru_cache(maxsize=1)
def get_elasticsearch_client() -> Elasticsearch:
    return Elasticsearch(settings.elasticsearch_url, request_timeout=30)


def ensure_client_logs_index(client_id: UUID) -> str:
    client = get_elasticsearch_client()
    index_name = client_logs_index_name(client_id)

    if client.indices.exists(index=index_name):
        return index_name

    client.indices.create(
        index=index_name,
        settings={
            "number_of_shards": 1,
            "number_of_replicas": 0,
        },
        mappings={
            "dynamic": True,
            "properties": {
                "@timestamp": {"type": "date"},
                "message": {"type": "text"},
                "source": {"type": "keyword"},
                "event_type": {"type": "keyword"},
                "external_id": {"type": "keyword"},
                "hostname": {"type": "keyword"},
                "ip_address": {"type": "ip"},
                "asset_type": {"type": "keyword"},
                "os": {"type": "keyword"},
                "indicator_values": {"type": "keyword", "ignore_above": 2048},
                "observed_ips": {"type": "ip"},
                "observed_domains": {"type": "keyword"},
                "observed_urls": {"type": "keyword", "ignore_above": 2048},
                "observed_hashes": {"type": "keyword"},
                "observed_emails": {"type": "keyword"},
                "observed_cves": {"type": "keyword"},
                "raw_event": {"type": "object", "enabled": False},
            },
        },
    )
    return index_name


def bulk_index_client_logs(client_id: UUID, documents: list[dict]) -> tuple[str, int]:
    client = get_elasticsearch_client()
    index_name = ensure_client_logs_index(client_id)

    actions = []
    for document in documents:
        action = {
            "_index": index_name,
            "_source": document,
        }
        external_id = document.get("external_id")
        if external_id:
            action["_id"] = external_id
        actions.append(action)

    success_count, errors = bulk(client, actions, refresh="wait_for", stats_only=False)
    if errors:
        raise RuntimeError(f"Failed to index {len(errors)} log documents into Elasticsearch.")

    return index_name, success_count


def fetch_recent_client_logs(client_id: UUID, limit: int = 20) -> list[dict]:
    client = get_elasticsearch_client()
    index_name = ensure_client_logs_index(client_id)
    response = client.search(
        index=index_name,
        size=limit,
        query={"match_all": {}},
        sort=[{"@timestamp": {"order": "desc", "unmapped_type": "date"}}],
    )
    return response["hits"]["hits"]


def search_client_logs_by_ioc(
    client_id: UUID,
    *,
    ioc_type: IocType,
    value: str,
    limit: int = 50,
) -> list[dict]:
    field_name = _IOC_FIELD_MAP.get(ioc_type)
    if field_name is None:
        return []

    client = get_elasticsearch_client()
    index_name = ensure_client_logs_index(client_id)
    response = client.search(
        index=index_name,
        size=limit,
        query={"term": {field_name: {"value": value}}},
        sort=[{"@timestamp": {"order": "desc", "unmapped_type": "date"}}],
    )
    return response["hits"]["hits"]
