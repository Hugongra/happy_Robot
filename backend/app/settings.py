"""Application settings loaded from environment variables."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # API security
    api_key: str = "dev-api-key-change-me"

    # FMCSA
    fmcsa_web_key: str = ""
    fmcsa_base_url: str = "https://mobile.fmcsa.dot.gov/qc/services/carriers"

    # HappyRobot (for issuing LiveKit voice tokens)
    happyrobot_api_key: str = ""
    happyrobot_workflow_id: str = ""
    happyrobot_base_url: str = "https://platform.happyrobot.ai/api/v2"

    # DB
    database_url: str = "sqlite+aiosqlite:///./data/carrier_sales.db"

    # CORS — comma-separated list of allowed origins for the dashboard / web-call client
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Negotiation tuning (defaults if a load has no explicit min_acceptable_rate)
    default_floor_pct: float = 0.92  # floor = loadboard_rate * 0.92

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
