from __future__ import annotations

from collections.abc import Iterable

import requests
from bs4 import BeautifulSoup

from backend.config import settings
from backend.models.enums import IocType
from backend.models.ioc import IoC


class MispClientError(RuntimeError):
    pass


def _misp_attribute_mapping(ioc_type: IocType) -> tuple[str, str]:
    mapping = {
        IocType.URL: ("url", "Network activity"),
        IocType.DOMAIN: ("domain", "Network activity"),
        IocType.IP: ("ip-dst", "Network activity"),
        IocType.EMAIL: ("email-src", "Payload delivery"),
        IocType.MD5: ("md5", "Artifacts dropped"),
        IocType.SHA1: ("sha1", "Artifacts dropped"),
        IocType.SHA256: ("sha256", "Artifacts dropped"),
        IocType.FILENAME: ("filename", "Artifacts dropped"),
        IocType.CVE: ("vulnerability", "External analysis"),
    }
    return mapping.get(ioc_type, ("text", "Other"))


class MispClient:
    def __init__(self) -> None:
        self.base_url = settings.misp_url.rstrip("/")
        self.session_base_url = self.base_url.replace("https://", "http://", 1)
        self.api_key = settings.misp_key.strip()
        self.admin_email = (settings.misp_admin_email or "").strip()
        self.admin_password = (settings.misp_admin_password or "").strip()
        self.session = requests.Session()
        self.session.verify = False
        self.session.headers.update(
            {
                "Accept": "application/json",
                "User-Agent": "HUNTER-MISP-Client/0.1",
            }
        )
        self._session_ready = False

    def _parse_json(self, response: requests.Response) -> dict:
        if not response.content:
            return {}
        try:
            return response.json()
        except ValueError as exc:
            raise MispClientError(
                f"MISP returned a non-JSON response for {response.request.method} "
                f"{response.request.url}: {response.text[:400]}"
            ) from exc

    def _raise_for_response(self, response: requests.Response) -> None:
        if response.status_code < 400:
            return
        detail = response.text[:400]
        raise MispClientError(
            f"MISP request failed with HTTP {response.status_code}: {detail}"
        )

    def _login_with_session(self) -> None:
        if self._session_ready:
            return
        if not self.admin_email or not self.admin_password:
            raise MispClientError("MISP admin email/password are not configured for session fallback.")

        login_url = f"{self.session_base_url}/users/login"
        login_page = self.session.get(login_url, timeout=20, allow_redirects=True)
        login_page.raise_for_status()

        soup = BeautifulSoup(login_page.text, "html.parser")
        form = soup.find("form", id="UserLoginForm") or soup.find("form")
        if form is None:
            raise MispClientError("Unable to locate the MISP login form for session authentication.")

        payload: dict[str, str] = {}
        for input_tag in form.find_all("input"):
            name = input_tag.get("name")
            if not name:
                continue
            payload[name] = input_tag.get("value", "")

        email_field = next((name for name in payload if name.endswith("[email]")), None)
        password_field = next((name for name in payload if name.endswith("[password]")), None)
        if not email_field or not password_field:
            raise MispClientError("Unable to identify the MISP login form email/password fields.")

        payload[email_field] = self.admin_email
        payload[password_field] = self.admin_password

        response = self.session.post(
            login_url,
            data=payload,
            headers={"Referer": login_url},
            timeout=20,
            allow_redirects=False,
        )
        if response.status_code >= 400:
            self._raise_for_response(response)

        location = response.headers.get("Location", "")
        if response.status_code in {301, 302, 303} and "/users/login" not in location:
            self._session_ready = True
            return

        if "id=\"UserLoginForm\"" in response.text:
            raise MispClientError("MISP session authentication failed with the configured admin credentials.")

        self._session_ready = True

    def request(self, method: str, path: str, *, json_payload: dict | None = None) -> dict:
        url = f"{self.base_url}{path}"
        api_headers = {"X-MISP-Auth": self.api_key} if self.api_key else {}
        response = self.session.request(
            method,
            url,
            json=json_payload,
            headers=api_headers,
            timeout=20,
            allow_redirects=False,
        )
        if response.status_code < 400:
            return self._parse_json(response)

        if response.status_code not in {401, 403}:
            self._raise_for_response(response)

        self._login_with_session()
        session_url = f"{self.session_base_url}{path}"
        response = self.session.request(
            method,
            session_url,
            json=json_payload,
            timeout=20,
            allow_redirects=False,
        )
        self._raise_for_response(response)
        return self._parse_json(response)

    def create_event(self, *, info: str) -> dict:
        payload = {
            "Event": {
                "info": info,
                "distribution": 0,
                "analysis": 2,
                "threat_level_id": 2,
            }
        }
        response = self.request("POST", "/events/add", json_payload=payload)
        return response.get("Event", response)

    def add_attribute(self, event_id: str, ioc: IoC) -> dict:
        misp_type, category = _misp_attribute_mapping(ioc.type)
        payload = {
            "Attribute": {
                "type": misp_type,
                "category": category,
                "value": ioc.value_normalized,
                "to_ids": True,
                "comment": ioc.description,
            }
        }
        response = self.request("POST", f"/attributes/add/{event_id}", json_payload=payload)
        return response.get("Attribute", response)

    def create_event_with_iocs(self, *, title: str, iocs: Iterable[IoC]) -> dict:
        event = self.create_event(info=title)
        event_id = str(event.get("id") or event.get("uuid") or "")
        if not event_id:
            raise MispClientError(f"Unable to determine the created MISP event identifier: {event}")

        ioc_list = list(iocs)[:200]  # cap at 200 to avoid unbounded sync
        attributes = []
        for ioc in ioc_list:
            misp_type, category = _misp_attribute_mapping(ioc.type)
            attributes.append({
                "type": misp_type,
                "category": category,
                "value": ioc.value_normalized,
                "to_ids": True,
                "comment": ioc.description or "",
            })

        if attributes:
            self.request(
                "POST",
                f"/attributes/massAdd/{event_id}",
                json_payload={"Attribute": attributes},
            )

        return {
            "event_id": str(event.get("id") or event_id),
            "event_uuid": str(event.get("uuid") or event_id),
            "attributes_added": len(attributes),
        }


def create_misp_event_with_iocs(*, title: str, iocs: Iterable[IoC]) -> dict:
    client = MispClient()
    return client.create_event_with_iocs(title=title, iocs=iocs)
