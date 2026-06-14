"""Fixtures compartidas para tests del MCP."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

MCP_DIR = Path(__file__).resolve().parent.parent
if str(MCP_DIR) not in sys.path:
    sys.path.insert(0, str(MCP_DIR))


@pytest.fixture(autouse=True)
def reset_singletons():
    from cache import cache_clear
    from client import reset_client
    from config import reset_settings
    from rate_limit import get_rate_limiter

    cache_clear()
    reset_client()
    reset_settings()
    get_rate_limiter().reset()
    yield
    cache_clear()
    reset_client()
    reset_settings()
    get_rate_limiter().reset()


@pytest.fixture
def settings():
    from config import Settings

    return Settings(
        carrier_api_base_url="http://test",
        carrier_api_key="fake-key",
        mcp_write_enabled=False,
    )


@pytest.fixture
def client(settings):
    from client import CarrierAPIClient

    return CarrierAPIClient(settings)
