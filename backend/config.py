from functools import cached_property
from urllib.parse import urlparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = Field(alias="DATABASE_URL")
    secret_key: str = Field(alias="SECRET_KEY")
    access_token_expire_minutes: int = Field(alias="ACCESS_TOKEN_EXPIRE_MINUTES")

    vault_addr: str = Field(alias="VAULT_ADDR")
    vault_token: str = Field(alias="VAULT_TOKEN")

    minio_endpoint: str = Field(alias="MINIO_ENDPOINT")
    minio_access_key: str = Field(alias="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field(alias="MINIO_SECRET_KEY")
    minio_bucket: str = Field(alias="MINIO_BUCKET")

    redis_url: str = Field(alias="REDIS_URL")
    elasticsearch_url: str = Field(alias="ELASTICSEARCH_URL")
    celery_broker_url: str | None = Field(default=None, alias="CELERY_BROKER_URL")
    celery_result_backend: str | None = Field(default=None, alias="CELERY_RESULT_BACKEND")
    collection_scheduler_interval_seconds: int = Field(
        default=60,
        alias="COLLECTION_SCHEDULER_INTERVAL_SECONDS",
    )

    misp_url: str = Field(alias="MISP_URL")
    misp_key: str = Field(alias="MISP_KEY")
    misp_admin_email: str | None = Field(default=None, alias="MISP_ADMIN_EMAIL")
    misp_admin_password: str | None = Field(default=None, alias="MISP_ADMIN_PASSWORD")

    opencti_url: str = Field(alias="OPENCTI_URL")
    opencti_token: str = Field(alias="OPENCTI_TOKEN")

    thehive_url: str = Field(alias="THEHIVE_URL")
    thehive_api_key: str = Field(alias="THEHIVE_API_KEY")

    bootstrap_admin_email: str | None = Field(default=None, alias="BOOTSTRAP_ADMIN_EMAIL")
    bootstrap_admin_password: str | None = Field(default=None, alias="BOOTSTRAP_ADMIN_PASSWORD")

    ollama_url: str = Field(default="http://ollama:11434", alias="OLLAMA_URL")

    virustotal_api_key: str | None = Field(default=None, alias="VIRUSTOTAL_API_KEY")
    shodan_api_key: str | None = Field(default=None, alias="SHODAN_API_KEY")
    abuseipdb_api_key: str | None = Field(default=None, alias="ABUSEIPDB_API_KEY")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_ignore_empty=True,
        extra="ignore",
        case_sensitive=False,
    )

    @cached_property
    def minio_parsed_endpoint(self):
        endpoint = self.minio_endpoint
        if "://" not in endpoint:
            endpoint = f"http://{endpoint}"
        return urlparse(endpoint)

    @property
    def minio_host(self) -> str:
        return self.minio_parsed_endpoint.netloc or self.minio_parsed_endpoint.path

    @property
    def minio_secure(self) -> bool:
        return self.minio_parsed_endpoint.scheme == "https"

    @property
    def resolved_celery_broker_url(self) -> str:
        return self.celery_broker_url or self.redis_url

    @property
    def resolved_celery_result_backend(self) -> str:
        return self.celery_result_backend or self.redis_url


settings = Settings()
