from __future__ import annotations

import base64
from urllib.parse import quote

import requests

from backend.config import settings
from backend.services.thehive_payloads import build_thehive_case_payload


def _is_placeholder(value: str | None) -> bool:
    cleaned = str(value or "").strip()
    return not cleaned or cleaned.startswith("change_me_")


class TheHiveClientError(RuntimeError):
    pass


class TheHiveClient:
    def __init__(self) -> None:
        self.base_url = settings.thehive_url.rstrip("/")
        self.api_key = str(settings.thehive_api_key or "").strip()
        self.admin_login = str(settings.thehive_admin_login or "").strip()
        self.admin_password = str(settings.thehive_admin_password or "").strip()
        self.organisation = str(settings.thehive_organisation or "").strip()
        self.session = requests.Session()
        self.session.headers.update(
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "HUNTER-TheHive-Client/0.1",
            }
        )

    def _organisation_headers(self) -> dict[str, str]:
        if not self.organisation:
            return {}
        return {"X-Organisation": self.organisation}

    def _renew_api_key(self) -> str:
        if _is_placeholder(self.admin_login) or _is_placeholder(self.admin_password):
            raise TheHiveClientError(
                "TheHive API key is not configured and admin credentials are unavailable."
            )

        auth_pair = f"{self.admin_login}:{self.admin_password}".encode("utf-8")
        basic_auth = base64.b64encode(auth_pair).decode("ascii")
        response = self.session.post(
            f"{self.base_url}/api/user/{quote(self.admin_login, safe='')}/key/renew",
            headers={"Authorization": f"Basic {basic_auth}"},
            timeout=20,
        )
        if response.status_code >= 400:
            raise TheHiveClientError(
                f"TheHive API key renewal failed ({response.status_code}): {response.text[:300]}"
            )

        try:
            payload = response.json()
        except ValueError:
            payload = response.text

        if isinstance(payload, str):
            renewed_key = payload.strip().strip('"')
        elif isinstance(payload, dict):
            renewed_key = str(
                payload.get("key")
                or payload.get("apiKey")
                or payload.get("api_key")
                or ""
            ).strip()
        else:
            renewed_key = ""

        if not renewed_key:
            raise TheHiveClientError("TheHive API key renewal returned an empty key.")

        self.api_key = renewed_key
        return renewed_key

    def _resolved_api_key(self) -> str:
        if not _is_placeholder(self.api_key):
            return self.api_key
        return self._renew_api_key()

    def _auth_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._resolved_api_key()}",
            **self._organisation_headers(),
        }

    def create_case(
        self,
        *,
        title: str,
        alert_description: str | None,
        severity: str | None,
        client_name: str | None,
        matched_iocs: list,
        tags: list[str] | None = None,
    ) -> dict:
        payload = build_thehive_case_payload(
            title=title,
            alert_description=alert_description,
            severity=severity,
            client_name=client_name,
            matched_iocs=matched_iocs,
            tags=tags,
        )
        response = self.session.post(
            f"{self.base_url}/api/case",
            json=payload,
            headers=self._auth_headers(),
            timeout=30,
        )
        if response.status_code >= 400:
            raise TheHiveClientError(
                f"TheHive case creation failed ({response.status_code}): {response.text[:300]}"
            )

        try:
            body = response.json()
        except ValueError as exc:
            raise TheHiveClientError("TheHive returned a non-JSON response.") from exc

        case_id = str(body.get("id") or body.get("_id") or body.get("number") or "").strip()
        if not case_id:
            raise TheHiveClientError("TheHive case creation succeeded but no case identifier was returned.")

        return {"case_id": case_id, "case": body}


def create_case_for_alert(
    *,
    title: str,
    alert_description: str | None,
    severity: str | None,
    client_name: str | None,
    matched_iocs: list,
    tags: list[str] | None = None,
) -> dict:
    client = TheHiveClient()
    return client.create_case(
        title=title,
        alert_description=alert_description,
        severity=severity,
        client_name=client_name,
        matched_iocs=matched_iocs,
        tags=tags,
    )
