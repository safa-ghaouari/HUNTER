from datetime import timedelta
from io import BytesIO
from functools import lru_cache

from minio import Minio

from backend.config import settings


@lru_cache(maxsize=1)
def get_minio_client() -> Minio:
    return Minio(
        settings.minio_host,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def init_bucket(bucket_name: str) -> None:
    client = get_minio_client()
    if not client.bucket_exists(bucket_name):
        client.make_bucket(bucket_name)


def upload_file(bucket: str, name: str, data: bytes, content_type: str) -> None:
    client = get_minio_client()
    payload = BytesIO(data)
    client.put_object(
        bucket_name=bucket,
        object_name=name,
        data=payload,
        length=len(data),
        content_type=content_type,
    )


def get_presigned_url(bucket: str, name: str, expires: timedelta | int) -> str:
    client = get_minio_client()
    expiry = expires if isinstance(expires, timedelta) else timedelta(seconds=expires)
    return client.presigned_get_object(bucket, name, expires=expiry)
