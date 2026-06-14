"""Configuración del servidor MCP (pydantic-settings)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    carrier_api_base_url: str = "http://localhost:8000"
    carrier_api_key: str = ""
    mcp_rate_limit_per_min: int = 120
    metrics_cache_ttl_seconds: int = 60

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def base_url(self) -> str:
        return self.carrier_api_base_url.rstrip("/")


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    """Solo para tests."""
    global _settings
    _settings = None
