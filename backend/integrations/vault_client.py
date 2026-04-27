from functools import lru_cache

import hvac

from backend.config import settings


def _split_secret_path(path: str) -> tuple[str, str]:
    normalized = path.strip("/")
    mount_point, secret_path = normalized.split("/", 1)
    return mount_point, secret_path


@lru_cache(maxsize=1)
def get_vault_client() -> hvac.Client:
    client = hvac.Client(url=settings.vault_addr, token=settings.vault_token)
    if not client.is_authenticated():
        raise RuntimeError("Vault authentication failed with the configured token.")
    return client


def write_secret(path: str, data: dict[str, str]) -> None:
    mount_point, secret_path = _split_secret_path(path)
    client = get_vault_client()
    client.secrets.kv.v2.create_or_update_secret(
        mount_point=mount_point,
        path=secret_path,
        secret=data,
    )


def delete_secret(path: str) -> None:
    mount_point, secret_path = _split_secret_path(path)
    client = get_vault_client()
    client.secrets.kv.v2.delete_latest_version_of_secret(
        mount_point=mount_point,
        path=secret_path,
    )


def read_secret(path: str) -> dict[str, str]:
    mount_point, secret_path = _split_secret_path(path)
    client = get_vault_client()
    secret = client.secrets.kv.v2.read_secret_version(
        mount_point=mount_point,
        path=secret_path,
    )
    return dict(secret["data"]["data"])
