"""Runtime configuration for the adapter, loaded from env vars."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven settings. See infra/.env.example."""

    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    # ── S3 / MinIO ────────────────────────────────────────────────────
    s3_endpoint: str = Field(default="http://minio:9000", alias="S3_ENDPOINT")
    s3_region: str = Field(default="us-east-1", alias="S3_REGION")
    s3_access_key: str = Field(default="doc365", alias="S3_ACCESS_KEY")
    s3_secret_key: str = Field(default="doc365dev", alias="S3_SECRET_KEY")
    s3_bucket: str = Field(default="doc365-uploads", alias="S3_BUCKET")
    s3_force_path_style: bool = Field(default=True, alias="S3_FORCE_PATH_STYLE")

    # ── Signing ───────────────────────────────────────────────────────
    hmac_secret: str = Field(alias="ADAPTER_HMAC_SECRET")

    # ── Hermes ────────────────────────────────────────────────────────
    hermes_model_provider: str = Field(default="openai", alias="HERMES_MODEL_PROVIDER")
    hermes_api_key: str = Field(default="", alias="HERMES_API_KEY")
    hermes_model: str = Field(default="gpt-4o-mini", alias="HERMES_MODEL")
    hermes_home: str = Field(default="/hermes-data", alias="HERMES_HOME")

    # ── Feature flags ─────────────────────────────────────────────────
    orizon_submit_enabled: bool = Field(default=False, alias="ORIZON_SUBMIT_ENABLED")

    # ── Limits ────────────────────────────────────────────────────────
    max_file_bytes: int = Field(default=50 * 1024 * 1024, alias="ADAPTER_MAX_FILE_BYTES")
    max_request_bytes: int = Field(default=200 * 1024 * 1024, alias="ADAPTER_MAX_REQUEST_BYTES")
    history_turns: int = Field(default=30, alias="ADAPTER_HISTORY_TURNS")

    # ── Logging ───────────────────────────────────────────────────────
    log_level: str = Field(default="info", alias="LOG_LEVEL")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
