"""Runtime configuration for the adapter, loaded from env vars."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _split_csv(raw: str) -> list[str] | None:
    """Split a comma-separated env var into a list, returning None if empty.

    Returning None lets us pass "don't override" to `AIAgent` instead of an
    empty list, which Hermes treats as "disable everything".
    """
    if not raw:
        return None
    items = [piece.strip() for piece in raw.split(",")]
    items = [piece for piece in items if piece]
    return items or None


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
    hermes_base_url: str = Field(default="", alias="HERMES_BASE_URL")
    hermes_api_mode: str = Field(default="", alias="HERMES_API_MODE")
    hermes_max_iterations: int = Field(default=40, alias="HERMES_MAX_ITERATIONS")
    hermes_enabled_toolsets_raw: str = Field(
        default="file,browser,terminal,web,vision,memory,session_search,skills,todo,code_execution",
        alias="HERMES_ENABLED_TOOLSETS",
    )
    hermes_disabled_toolsets_raw: str = Field(
        default="clarify,messaging,tts,cronjob",
        alias="HERMES_DISABLED_TOOLSETS",
    )
    hermes_persona_enabled: bool = Field(
        default=True,
        alias="HERMES_PERSONA_ENABLED",
        description="Enable the full persona (domain knowledge, memory, Orizon patterns). "
                    "Set to false to revert to the minimal system prompt.",
    )

    @property
    def hermes_enabled_toolsets(self) -> list[str] | None:
        return _split_csv(self.hermes_enabled_toolsets_raw)

    @property
    def hermes_disabled_toolsets(self) -> list[str] | None:
        return _split_csv(self.hermes_disabled_toolsets_raw)

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
