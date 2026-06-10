"""X-API-Key authentication for all /api/* routes."""
import secrets

from fastapi import Header, HTTPException, status

from app.settings import settings

# Paths that stay unauthenticated (infra / OpenAPI UI only — not business API).
PUBLIC_PATHS: frozenset[str] = frozenset({
    "/healthz",
    "/docs",
    "/openapi.json",
    "/redoc",
})


def api_key_valid(provided: str | None) -> bool:
    """Constant-time compare to avoid timing leaks."""
    if not provided or not settings.api_key:
        return False
    return secrets.compare_digest(provided, settings.api_key)


async def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """FastAPI dependency — pass the key in the X-API-Key header."""
    if not api_key_valid(x_api_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid API key (X-API-Key).",
        )
