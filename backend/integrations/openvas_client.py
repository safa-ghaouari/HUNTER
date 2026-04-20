"""OpenVAS / Greenbone GMP client.

Connects to a client's OpenVAS scanner via the Greenbone Management Protocol
(GMP) over TLS and pulls finished scan results filtered by severity threshold.

Credentials are read from Vault at runtime (openvas_username / openvas_password).
"""

from __future__ import annotations

from typing import Any

from backend.integrations.vault_client import read_secret


class OpenVASClientError(RuntimeError):
    pass


def _gmp_available() -> bool:
    try:
        from gvm.connections import TLSConnection  # noqa: F401
        return True
    except ImportError:
        return False


def pull_scan_results(
    *,
    host: str,
    port: int = 9390,
    username: str,
    password: str,
    min_severity: float = 4.0,
) -> list[dict[str, Any]]:
    """Connect to OpenVAS GMP and return high/critical findings.

    Returns a list of dicts:
        {host, port, nvt_name, cvss_score, cve, description, solution}
    """
    if not _gmp_available():
        raise OpenVASClientError(
            "python-gvm is not installed. Add 'python-gvm' to requirements.txt."
        )

    from gvm.connections import TLSConnection
    from gvm.protocols.gmp import Gmp
    from gvm.transforms import EtreeCheckCommandTransform

    results: list[dict[str, Any]] = []

    connection = TLSConnection(hostname=host, port=port)
    transform = EtreeCheckCommandTransform()

    with Gmp(connection=connection, transform=transform) as gmp:
        gmp.authenticate(username, password)

        response = gmp.get_results(
            filter_string=f"severity>{min_severity} and apply_overrides=0 rows=-1"
        )

        for result in response.findall("result"):
            severity_text = (result.findtext("severity") or "0").strip()
            try:
                severity = float(severity_text)
            except ValueError:
                severity = 0.0
            if severity < min_severity:
                continue

            host_elem = result.find("host")
            asset_host = (host_elem.text or "").strip() if host_elem is not None else ""
            asset_port = (result.findtext("port") or "").strip()

            nvt = result.find("nvt")
            nvt_name = (nvt.findtext("name") or "").strip() if nvt is not None else ""
            cve_refs = []
            if nvt is not None:
                for ref in nvt.findall("refs/ref"):
                    if ref.get("type", "").upper() == "CVE":
                        cve_refs.append(ref.get("id", ""))

            description = (result.findtext("description") or "").strip()
            solution = ""
            if nvt is not None:
                solution = (nvt.findtext("solution") or "").strip()

            results.append({
                "host": asset_host,
                "port": asset_port,
                "nvt_name": nvt_name,
                "cvss_score": severity,
                "cves": cve_refs,
                "description": description,
                "solution": solution,
            })

    return results


def pull_scan_results_for_client(client_vault_path: str, openvas_url: str) -> list[dict[str, Any]]:
    """High-level helper: read creds from Vault then pull results."""
    secret = read_secret(client_vault_path)
    username = secret.get("openvas_username", "")
    password = secret.get("openvas_password", "")
    if not username or not password:
        raise OpenVASClientError(
            "OpenVAS credentials not found in Vault. "
            "Set openvas_username and openvas_password via PATCH /admin/clients/{id}."
        )

    # openvas_url format: "host:port" or just "host"
    parts = openvas_url.rsplit(":", 1)
    host = parts[0].replace("https://", "").replace("http://", "")
    port = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else 9390

    return pull_scan_results(host=host, port=port, username=username, password=password)
