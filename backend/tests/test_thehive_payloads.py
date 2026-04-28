from types import SimpleNamespace

from backend.services.thehive_payloads import (
    build_case_description,
    build_thehive_case_payload,
    map_severity_to_thehive,
)


def test_map_severity_to_thehive_uses_expected_scale() -> None:
    assert map_severity_to_thehive("critical") == 4
    assert map_severity_to_thehive("high") == 3
    assert map_severity_to_thehive("medium") == 2
    assert map_severity_to_thehive("low") == 1
    assert map_severity_to_thehive(None) == 1


def test_build_case_description_embeds_client_and_iocs() -> None:
    matched_iocs = [
        {"type": "domain", "value_normalized": "login.badcorp-secure.com"},
        SimpleNamespace(type=SimpleNamespace(value="ip"), value_normalized="198.51.100.77"),
    ]

    description = build_case_description(
        client_name="Acme MSSP Client",
        alert_description="Proxy traffic matched a phishing destination.",
        matched_iocs=matched_iocs,
    )

    assert "Client: Acme MSSP Client" in description
    assert "Proxy traffic matched a phishing destination." in description
    assert "domain:login.badcorp-secure.com" in description
    assert "ip:198.51.100.77" in description


def test_build_thehive_case_payload_adds_hunter_tags() -> None:
    payload = build_thehive_case_payload(
        title="Phishing correlation detected",
        alert_description="Correlated alert",
        severity="high",
        client_name="Acme MSSP Client",
        matched_iocs=[{"type": "domain", "value_normalized": "login.badcorp-secure.com"}],
        tags=["client-acme", "hunter"],
    )

    assert payload["title"] == "Phishing correlation detected"
    assert payload["severity"] == 3
    assert payload["tlp"] == 2
    assert payload["pap"] == 2
    assert payload["tags"] == ["auto-generated", "client-acme", "hunter"]
