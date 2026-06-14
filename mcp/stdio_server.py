"""MCP server read-only — expone la Carrier Sales API como tools para Claude."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from dotenv import load_dotenv

_mcp_dir = Path(__file__).resolve().parent
load_dotenv(_mcp_dir / ".env")

from bootstrap import import_fastmcp_class  # noqa: E402

FastMCP = import_fastmcp_class()

from client import get_client  # noqa: E402
from models import (  # noqa: E402
    CallDetailResponse,
    CallRow,
    LoadItem,
    MetricsSummaryResponse,
    RateLimitResponse,
    RecentCallsResponse,
    SearchLoadsResponse,
)
from rate_limit import get_rate_limiter  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mcp = FastMCP("carrier-sales-agent")

API_LOADS_MAX = 10


def _rate_limit_or_none() -> str | None:
    limiter = get_rate_limiter()
    allowed, retry_seconds = limiter.check()
    if not allowed:
        response = RateLimitResponse(
            message=(
                f"Rate limit reached ({limiter.limit}/min). "
                f"Retry in {retry_seconds}s."
            )
        )
        return json.dumps(response.model_dump(), indent=2)
    return None


def _error_json(data: dict) -> str:
    return json.dumps(data, indent=2)


@mcp.tool()
async def search_loads(
    origin: str | None = None,
    destination: str | None = None,
    equipment_type: str | None = None,
    limit: int = 10,
) -> str:
    """Search available freight loads on the loadboard.

    Use this when the user asks about open loads, lanes, rates, equipment,
    or what freight is available between cities.

    Args:
        origin: Pickup city or market (e.g. "Dallas"). Optional filter.
        destination: Delivery city or market (e.g. "Atlanta"). Optional filter.
        equipment_type: Equipment filter (e.g. "Dry Van", "Reefer"). Optional.
        limit: Max rows to return (default 10). Backend caps at 10 rows total.

    Example questions this answers:
    - "Any Dallas to Atlanta dry van loads?"
    - "What's posted out of Chicago right now?"
    - "Show me reefer loads under $2/mile."
    """
    if blocked := _rate_limit_or_none():
        return blocked

    limit = max(1, min(API_LOADS_MAX, limit))

    data, x_cache = await get_client().search_loads(
        origin=origin,
        destination=destination,
        equipment_type=equipment_type,
        limit=limit,
    )

    if isinstance(data, dict) and data.get("error"):
        return _error_json(data)

    loads = [LoadItem.model_validate(row) for row in data.get("loads", [])]
    response = SearchLoadsResponse(
        loads=loads,
        count=len(loads),
        limit=data.get("limit", limit),
        x_cache=x_cache,
    )
    return response.model_dump_json(indent=2)


@mcp.tool()
async def get_metrics_summary(window_days: int = 7) -> str:
    """Return aggregated KPIs for the carrier sales operation.

    Use this when the user asks about overall performance, booking rate,
    savings, KPIs, or how the operation is doing.

    Args:
        window_days: Lookback window in days (default 7). Response is cached
            for 60 seconds (see x_cache: HIT/MISS).

    Example questions this answers:
    - "How is the operation performing this month?"
    - "What's our booking rate over the last week?"
    - "Show me a KPI summary."
    """
    if blocked := _rate_limit_or_none():
        return blocked

    data, x_cache = await get_client().get_metrics_summary(window_days=window_days)

    if isinstance(data, dict) and data.get("error"):
        return _error_json(data)

    response = MetricsSummaryResponse.model_validate(
        {**data, "window_days": data.get("window_days", window_days), "x_cache": x_cache}
    )
    return response.model_dump_json(indent=2)


@mcp.tool()
async def get_recent_calls(
    limit: int = 15,
    offset: int = 0,
    outcome: str | None = None,
    hide_test_calls: bool = True,
) -> str:
    """List recent voice-agent calls with outcomes and negotiation details.

    Use this when the user asks about recent calls, bookings, rejections,
    carrier activity, or wants to pick a call ID for drill-down.

    Args:
        limit: Max rows to return (default 15, max 50).
        offset: Skip this many rows after filters (default 0). Useful when
            the user asks for "the next page" of calls.
        outcome: Optional filter (e.g. load_booked, price_rejected). Matched
            client-side against the outcome field.
        hide_test_calls: When true (default), excludes platform_run rows with
            no MC number (internal test traffic).

    Example questions this answers:
    - "List the 5 most recent calls."
    - "Show me calls that ended in a booking."
    - "Any price-rejected calls today?"
    """
    if blocked := _rate_limit_or_none():
        return blocked

    limit = max(1, min(50, limit))
    offset = max(0, offset)

    data, x_cache = await get_client().get_recent_calls(
        limit=limit,
        offset=offset,
        outcome=outcome,
        hide_test_calls=hide_test_calls,
    )

    if isinstance(data, dict) and data.get("error"):
        return _error_json(data)

    calls = [CallRow.model_validate(row) for row in data.get("calls", [])]
    response = RecentCallsResponse(
        calls=calls,
        count=len(calls),
        total_count=data.get("total_count", len(calls)),
        offset=data.get("offset", offset),
        limit=data.get("limit", limit),
        has_more=data.get("has_more", False),
        x_cache=x_cache,
    )
    return response.model_dump_json(indent=2)


@mcp.tool()
async def get_call_detail(call_id: int) -> str:
    """Return full detail for a single call (transcript, payload, load, transfer).

    Use this after get_recent_calls when the user wants to inspect one call:
    transcript, classification reasoning, raw webhook payload, load fields,
    and transfer status.

    Args:
        call_id: Numeric call ID from get_recent_calls or the dashboard.

    Example questions this answers:
    - "Open call ID 42 and show the transcript."
    - "What happened on call 7 — why was it rejected?"
    - "Show me the full details for the first recent call."
    """
    if blocked := _rate_limit_or_none():
        return blocked

    data, x_cache = await get_client().get_call_detail(call_id)

    if isinstance(data, dict) and data.get("error"):
        return _error_json(data)

    response = CallDetailResponse(detail=data, x_cache=x_cache)
    return response.model_dump_json(indent=2)


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
