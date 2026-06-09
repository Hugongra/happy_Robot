"""Simple X-API-Key auth dependency for FastAPI routes."""
from fastapi import Header, HTTPException, status
from app.settings import settings


async def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """All protected endpoints depend on this. Pass the key in X-API-Key header."""
    if not x_api_key or x_api_key != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key (X-API-Key).",
        )
