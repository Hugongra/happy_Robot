"""Tests del cliente HTTP (retries, cache, paginación)."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import httpx
import pytest

from client import CarrierAPIClient
from config import Settings


@pytest.mark.asyncio
async def test_get_metrics_uses_cache_on_second_call(client):
    mock_response = {"total_calls": 42, "booking_rate": 0.35}

    with patch.object(
        client, "_request", new_callable=AsyncMock, return_value=mock_response
    ) as mock_request:
        first, cache1 = await client.get_metrics_summary()
        second, cache2 = await client.get_metrics_summary()

        assert mock_request.call_count == 1
        assert first == mock_response
        assert second == mock_response
        assert cache1 == "MISS"
        assert cache2 == "HIT"


@pytest.mark.asyncio
async def test_search_loads_respects_limit(client):
    loads = [{"load_id": f"L{i}", "lane": f"Lane {i}"} for i in range(5)]

    with patch.object(
        client,
        "_request",
        new_callable=AsyncMock,
        return_value=loads,
    ):
        data, _ = await client.search_loads(limit=2)

        assert len(data["loads"]) == 2
        assert data["loads"][0]["load_id"] == "L0"
        assert data["limit"] == 2


@pytest.mark.asyncio
async def test_get_recent_calls_filters_test_rows(client):
    rows = [
        {"call_id": 1, "outcome": "booked", "mc": "123"},
        {"call_id": 2, "outcome": "platform_run", "mc": ""},
        {"call_id": 3, "outcome": "booked", "mc": "456"},
    ]

    with patch.object(
        client,
        "_request",
        new_callable=AsyncMock,
        return_value=rows,
    ):
        data, _ = await client.get_recent_calls(limit=10, hide_test_calls=True)

        assert data["total_count"] == 2
        assert len(data["calls"]) == 2
        assert all(c["call_id"] != 2 for c in data["calls"])


@pytest.mark.asyncio
async def test_get_recent_calls_pagination(client):
    rows = [{"call_id": i, "outcome": "booked", "mc": "123"} for i in range(5)]

    with patch.object(
        client,
        "_request",
        new_callable=AsyncMock,
        return_value=rows,
    ):
        data, _ = await client.get_recent_calls(limit=2, offset=1)

        assert data["total_count"] == 5
        assert len(data["calls"]) == 2
        assert data["calls"][0]["call_id"] == 1
        assert data["has_more"] is True


@pytest.mark.asyncio
async def test_retry_exhausted_returns_structured_error():
    client = CarrierAPIClient(
        Settings(carrier_api_base_url="http://test", carrier_api_key="k")
    )

    with patch("client.httpx.AsyncClient") as mock_client_cls:
        mock_response = AsyncMock()
        mock_response.status_code = 503
        mock_response.text = "Service Unavailable"
        mock_response.request = httpx.Request("GET", "http://test/api/metrics/summary")

        mock_http = AsyncMock()
        mock_http.request = AsyncMock(return_value=mock_response)
        mock_http.__aenter__ = AsyncMock(return_value=mock_http)
        mock_http.__aexit__ = AsyncMock(return_value=None)
        mock_client_cls.return_value = mock_http

        data, x_cache = await client.get_metrics_summary()

        assert data["error"] is True
        assert "3 intentos" in data["message"]
        assert data["retry_after_seconds"] == 60
        assert x_cache == "MISS"
        assert mock_http.request.call_count == 3


@pytest.mark.asyncio
async def test_search_loads_not_cached(client):
    with patch.object(
        client,
        "_request",
        new_callable=AsyncMock,
        return_value=[{"load_id": "L1", "lane": "A"}],
    ) as mock_request:
        await client.search_loads()
        await client.search_loads()
        assert mock_request.call_count == 2


@pytest.mark.asyncio
async def test_get_call_detail_not_cached(client):
    detail = {"call_id": 1, "transcript": "hello"}

    with patch.object(
        client,
        "_request",
        new_callable=AsyncMock,
        return_value=detail,
    ) as mock_request:
        await client.get_call_detail(1)
        await client.get_call_detail(1)
        assert mock_request.call_count == 2
