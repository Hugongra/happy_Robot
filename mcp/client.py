"""Thin HTTP client for the Carrier Sales FastAPI backend."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

DEFAULT_BASE_URL = "http://localhost:8000"


def _base_url() -> str:
    return os.environ.get("CARRIER_API_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _api_key() -> str:
    key = os.environ.get("CARRIER_API_KEY", "").strip()
    if not key:
        raise ValueError("CARRIER_API_KEY is not set")
    return key


def _headers() -> dict[str, str]:
    return {"X-API-Key": _api_key(), "Accept": "application/json"}


def api_error(exc: Exception, *, context: str) -> dict[str, str]:
    """Structured error for MCP tool responses (never includes the API key)."""
    if isinstance(exc, httpx.ConnectError):
        return {
            "error": f"Cannot reach Carrier Sales API at {_base_url()}",
            "hint": "Start the backend (docker compose up) or set CARRIER_API_BASE_URL to the deployed API.",
        }
    if isinstance(exc, httpx.TimeoutException):
        return {
            "error": f"Request timed out while calling {context}",
            "hint": "Retry or check API health with GET /healthz.",
        }
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status == 401:
            return {
                "error": "API returned 401 Unauthorized",
                "hint": "Check CARRIER_API_KEY matches backend API_KEY.",
            }
        if status == 404:
            return {
                "error": f"Not found ({context})",
                "hint": "Verify the resource id exists in /api/metrics/recent-calls.",
            }
        body = exc.response.text[:200] if exc.response.text else ""
        return {
            "error": f"API returned HTTP {status} for {context}",
            "hint": body or "See backend logs or Swagger at /docs.",
        }
    if isinstance(exc, ValueError) and "CARRIER_API_KEY" in str(exc):
        return {
            "error": "CARRIER_API_KEY is not configured",
            "hint": "Copy mcp/.env.example to mcp/.env and set CARRIER_API_KEY.",
        }
    return {
        "error": f"Unexpected error during {context}: {type(exc).__name__}",
        "hint": str(exc)[:200],
    }


async def get_json(path: str, *, params: dict[str, Any] | None = None) -> Any:
    url = f"{_base_url()}{path}"
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, headers=_headers(), params=params)
        response.raise_for_status()
        return response.json()
