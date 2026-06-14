"""Tests de tools MCP (rate limit, modelos, paginación)."""

from __future__ import annotations

import importlib
import json
import sys
from unittest.mock import AsyncMock, patch

import pytest

from rate_limit import RateLimiter


def _import_server():
    """Importa stdio_server sin conflictos de path."""
    sys.modules.pop("stdio_server", None)
    return importlib.import_module("stdio_server")


@pytest.mark.asyncio
async def test_search_loads_tool_returns_loads_and_limit():
    server = _import_server()

    payload = {
        "loads": [{"load_id": "L1", "lane": "DAL-ATL"}],
        "limit": 10,
    }

    mock_client = AsyncMock(
        search_loads=AsyncMock(return_value=(payload, "MISS")),
    )
    with patch.object(server, "get_client", return_value=mock_client):
        raw = await server.search_loads(limit=10)
        data = json.loads(raw)

        assert data["count"] == 1
        assert data["limit"] == 10
        assert data["x_cache"] == "MISS"
        assert "has_more" not in data


@pytest.mark.asyncio
async def test_get_metrics_summary_includes_cache_header():
    server = _import_server()

    mock_client = AsyncMock(
        get_metrics_summary=AsyncMock(
            return_value=({"total_calls": 10, "booking_rate": 0.5}, "HIT")
        ),
    )
    with patch.object(server, "get_client", return_value=mock_client):
        raw = await server.get_metrics_summary()
        data = json.loads(raw)

        assert data["x_cache"] == "HIT"
        assert data["total_calls"] == 10


@pytest.mark.asyncio
async def test_rate_limit_blocks_after_max_calls():
    server = _import_server()

    limiter = RateLimiter(max_per_minute=2)
    mock_client = AsyncMock(
        get_metrics_summary=AsyncMock(return_value=({"total_calls": 1}, "MISS")),
    )
    with patch.object(server, "get_rate_limiter", return_value=limiter):
        with patch.object(server, "get_client", return_value=mock_client):
            await server.get_metrics_summary()
            await server.get_metrics_summary()
            blocked = await server.get_metrics_summary()

        data = json.loads(blocked)
        assert data["error"] is True
        assert "Rate limit reached (2/min)" in data["message"]
        assert "Retry in" in data["message"]
