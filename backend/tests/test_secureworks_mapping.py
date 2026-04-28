from backend.services.secureworks_mapping import (
    build_secureworks_log_record,
    build_secureworks_log_records,
    extract_secureworks_endpoint,
)


def test_extract_secureworks_endpoint_prefers_first_populated_entity() -> None:
    alert = {
        "entities": [
            {"hostname": "", "ipAddresses": []},
            {"hostname": "FIN-WKS-22", "ipAddresses": ["10.10.5.22", "10.10.5.23"]},
        ]
    }

    hostname, ip_address = extract_secureworks_endpoint(alert)

    assert hostname == "FIN-WKS-22"
    assert ip_address == "10.10.5.22"


def test_build_secureworks_log_record_includes_metadata_and_indicators() -> None:
    alert = {
        "id": "alert-123",
        "headline": "Credential phishing activity detected",
        "severity": "high",
        "status": "open",
        "createdAt": "2026-04-20T10:00:00Z",
        "updatedAt": "2026-04-20T10:05:00Z",
        "entities": [{"hostname": "FIN-WKS-22", "ipAddresses": ["10.10.5.22"]}],
        "indicators": [
            {"type": "domain", "value": "login.badcorp-secure.com"},
            {"type": "ip", "value": "198.51.100.77"},
        ],
    }

    record = build_secureworks_log_record(alert)

    assert record["timestamp"] == "2026-04-20T10:05:00Z"
    assert record["hostname"] == "FIN-WKS-22"
    assert record["ip_address"] == "10.10.5.22"
    assert record["source"] == "secureworks"
    assert record["event_type"] == "alert"
    assert record["external_id"] == "alert-123"
    assert "severity=high" in record["message"]
    assert "domain:login.badcorp-secure.com" in record["message"]
    assert record["raw_event"] == alert


def test_build_secureworks_log_records_applies_limit() -> None:
    alerts = [
        {"id": "1", "headline": "First", "entities": [], "indicators": []},
        {"id": "2", "headline": "Second", "entities": [], "indicators": []},
        {"id": "3", "headline": "Third", "entities": [], "indicators": []},
    ]

    records = build_secureworks_log_records(alerts, limit=2)

    assert [record["external_id"] for record in records] == ["1", "2"]
