"""Secureworks Taegis XDR REST client.

Authenticates via OAuth2 client-credentials flow and pulls open/new alerts
from the Taegis XDR GraphQL API.

Credentials (client_id / client_secret) are stored in Vault.
"""

from __future__ import annotations

from typing import Any

import requests

from backend.integrations.vault_client import read_secret

_TOKEN_URL = "https://api.secureworks.com/auth/api/v2/auth/token"
_GRAPHQL_URL = "https://api.secureworks.com/graphql"

_ALERTS_QUERY = """
query OpenAlerts($page: Int!, $perPage: Int!) {
  alertsServiceSearch(
    in: {
      query: "status:open OR status:new"
      page: $page
      perPage: $perPage
    }
  ) {
    alerts {
      id
      headline
      severity
      status
      createdAt
      updatedAt
      entities {
        ... on AlertEntityEndpoint {
          hostname
          ipAddresses
        }
      }
      indicators {
        ... on Indicator {
          type
          value
          confidence
        }
      }
    }
  }
}
"""


class SecureworksClientError(RuntimeError):
    pass


class SecureworksClient:
    def __init__(self, *, client_id: str, client_secret: str, base_url: str | None = None) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.graphql_url = (base_url.rstrip("/") + "/graphql") if base_url else _GRAPHQL_URL
        self.token_url = (base_url.rstrip("/") + "/auth/api/v2/auth/token") if base_url else _TOKEN_URL
        self._access_token: str | None = None

    def _authenticate(self) -> None:
        response = requests.post(
            self.token_url,
            json={
                "grant_type": "client_credentials",
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            },
            timeout=30,
        )
        if response.status_code != 200:
            raise SecureworksClientError(
                f"Taegis XDR authentication failed ({response.status_code}): {response.text[:300]}"
            )
        self._access_token = response.json()["access_token"]

    def _graphql(self, query: str, variables: dict) -> dict:
        if self._access_token is None:
            self._authenticate()
        response = requests.post(
            self.graphql_url,
            json={"query": query, "variables": variables},
            headers={"Authorization": f"Bearer {self._access_token}"},
            timeout=60,
        )
        if response.status_code == 401:
            self._access_token = None
            self._authenticate()
            response = requests.post(
                self.graphql_url,
                json={"query": query, "variables": variables},
                headers={"Authorization": f"Bearer {self._access_token}"},
                timeout=60,
            )
        if response.status_code != 200:
            raise SecureworksClientError(
                f"Taegis XDR GraphQL error ({response.status_code}): {response.text[:300]}"
            )
        data = response.json()
        if "errors" in data:
            raise SecureworksClientError(f"GraphQL errors: {data['errors']}")
        return data.get("data", {})

    def get_open_alerts(self, *, max_alerts: int = 200) -> list[dict[str, Any]]:
        """Fetch open/new alerts from Taegis XDR, up to max_alerts."""
        per_page = min(max_alerts, 100)
        page = 1
        collected: list[dict] = []

        while len(collected) < max_alerts:
            data = self._graphql(
                _ALERTS_QUERY,
                {"page": page, "perPage": per_page},
            )
            alerts = data.get("alertsServiceSearch", {}).get("alerts", [])
            if not alerts:
                break
            collected.extend(alerts)
            if len(alerts) < per_page:
                break
            page += 1

        return collected[:max_alerts]


def pull_alerts_for_client(client_vault_path: str, secureworks_url: str | None = None) -> list[dict[str, Any]]:
    """High-level helper: read creds from Vault then pull Taegis XDR alerts."""
    secret = read_secret(client_vault_path)
    client_id = secret.get("secureworks_client_id", "")
    client_secret = secret.get("secureworks_client_secret", "")
    if not client_id or not client_secret:
        raise SecureworksClientError(
            "Secureworks credentials not found in Vault. "
            "Set secureworks_client_id and secureworks_client_secret via PATCH /admin/clients/{id}."
        )
    client = SecureworksClient(
        client_id=client_id,
        client_secret=client_secret,
        base_url=secureworks_url,
    )
    return client.get_open_alerts()
