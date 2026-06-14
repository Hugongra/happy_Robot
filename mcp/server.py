"""Carrier Sales MCP server — read-only tools over the existing FastAPI API."""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path
from typing import Any

# Local package directory is named `mcp/`, which shadows the official `mcp` SDK on
# `python -m mcp.server`. Temporarily drop repo root from sys.path so imports
# resolve to the installed Anthropic MCP package.
_REPO_ROOT = str(Path(__file__).resolve().parent.parent)
_MCP_DIR = str(Path(__file__).resolve().parent)
if _MCP_DIR not in sys.path:
    sys.path.insert(0, _MCP_DIR)
if _REPO_ROOT in sys.path:
    sys.path.remove(_REPO_ROOT)

try:
    _fastmcp = importlib.import_module("mcp.server.fastmcp")
    FastMCP = _fastmcp.FastMCP
finally:
    if _REPO_ROOT not in sys.path:
        sys.path.insert(0, _REPO_ROOT)

from client import api_error, get_json  # noqa: E402

mcp = FastMCP(
    "carrier-sales",
    instructions=(
        "Read-only access to Acme Logistics carrier-sales operations: load board search, "
        "dashboard KPIs, and call history from the same API that powers the ops dashboard."
    ),
)


def _is_test_or_incomplete(row: dict[str, Any]) -> bool:
    mc = (row.get("mc_number") or "").strip()
    return row.get("outcome") == "platform_run" or not mc


def _negotiation_savings_pct_from_summary(summary: dict[str, Any]) -> float:
    """Positive = broker saved vs posted (inverse of API rate_delta_pct aggregate)."""
    rate_delta = float(summary.get("rate_delta_pct") or 0)
    return round(-rate_delta, 2)


def _compact_load(row: dict[str, Any]) -> dict[str, Any]:
    origin = row.get("origin") or ""
    destination = row.get("destination") or ""
    lane = f"{origin} → {destination}" if origin or destination else ""
    return {
        "load_id": row.get("load_id"),
        "lane": lane,
        "equipment": row.get("equipment_type"),
        "loadboard_rate": row.get("loadboard_rate"),
        "miles": row.get("miles"),
        "pickup_datetime": row.get("pickup_datetime"),
    }


def _compact_call_row(row: dict[str, Any]) -> dict[str, Any]:
    origin = row.get("origin") or ""
    destination = row.get("destination") or ""
    lane = f"{origin} → {destination}" if origin or destination else ""
    margin = row.get("broker_margin")
    if margin is None:
        lb = float(row.get("loadboard_rate") or 0)
        ag = float(row.get("agreed_rate") or 0)
        margin = max(lb - ag, 0) if row.get("outcome") == "load_booked" else 0
    return {
        "call_id": row.get("id"),
        "timestamp": row.get("created_at"),
        "mc": row.get("mc_number") or "",
        "carrier": row.get("carrier_name") or "",
        "lane": lane,
        "equipment": row.get("equipment_type") or "",
        "posted": row.get("loadboard_rate"),
        "agreed": row.get("agreed_rate"),
        "margin": margin,
        "rounds": row.get("num_counter_offers"),
        "outcome": row.get("outcome"),
        "sentiment": row.get("sentiment"),
    }


def _json_text(data: Any) -> str:
    return json.dumps(data, indent=2, default=str)


@mcp.tool()
async def search_loads(
    origin: str | None = None,
    destination: str | None = None,
    equipment_type: str | None = None,
    limit: int = 5,
) -> str:
    """Search the broker load board for available freight.

    Use when the user asks about open loads, lanes, posted rates, capacity on a
    route, or inventory (e.g. "any Dallas to Atlanta dry van loads?", "what's
    posted out of Chicago?").

    Parameters:
    - origin: Free-text origin city/state (optional).
    - destination: Free-text destination city/state (optional).
    - equipment_type: Equipment filter such as "Dry Van", "Reefer", "Flatbed" (optional).
    - limit: Max rows to return (1–10, default 5).

    Returns a compact list: load_id, lane, equipment, loadboard_rate, miles,
    pickup_datetime. Internal fields (e.g. floor rates) are never exposed.
    """
    try:
        params: dict[str, Any] = {"limit": min(max(limit, 1), 10)}
        if origin:
            params["origin"] = origin
        if destination:
            params["destination"] = destination
        if equipment_type:
            params["equipment_type"] = equipment_type

        rows = await get_json("/api/loads/search", params=params)
        compact = [_compact_load(r) for r in rows]
        return _json_text({"loads": compact, "count": len(compact)})
    except Exception as exc:
        return _json_text(api_error(exc, context="search_loads"))


@mcp.tool()
async def get_metrics_summary(window_days: int = 30) -> str:
    """Return dashboard KPIs for a time window.

    Use when the user asks how operations are performing: total calls, booking rate,
    margin captured, negotiation savings, FMCSA reject rate, or "how did we do last
    month?" (e.g. "show me last week's booking rate", "what's our negotiation
    savings?", "KPI summary for 30 days").

    Parameters:
    - window_days: Lookback window in days (1–365, default 30). Maps to GET
      /api/metrics/summary?days=...

    Returns a flat dict: total_calls, loads_booked, booking_rate, total_margin,
    avg_agreed_rate, negotiation_savings_pct, avg_rounds, fmcsa_reject_pct.
    """
    try:
        days = min(max(window_days, 1), 365)
        raw = await get_json("/api/metrics/summary", params={"days": days})
        flat = {
            "window_days": raw.get("window_days", days),
            "total_calls": raw.get("total_calls"),
            "loads_booked": raw.get("booked_loads"),
            "booking_rate": raw.get("booking_rate"),
            "total_margin": raw.get("total_broker_margin"),
            "avg_agreed_rate": raw.get("avg_agreed_rate"),
            "negotiation_savings_pct": _negotiation_savings_pct_from_summary(raw),
            "avg_rounds": raw.get("avg_negotiation_rounds"),
            "fmcsa_reject_pct": raw.get("fmcsa_rejection_rate"),
        }
        return _json_text(flat)
    except Exception as exc:
        return _json_text(api_error(exc, context="get_metrics_summary"))


@mcp.tool()
async def get_recent_calls(
    limit: int = 10,
    outcome: str | None = None,
    hide_test_calls: bool = True,
) -> str:
    """List recent inbound carrier calls with compact rows.

    Use when the user asks about call history, recent bookings, rejections, lanes
    handled, or sentiment (e.g. "show recent calls", "last 10 booked loads",
    "calls that price-rejected this week").

    Parameters:
    - limit: Max rows after filtering (1–200, default 10).
    - outcome: Optional outcome filter (e.g. load_booked, price_rejected,
      carrier_ineligible). Applied client-side.
    - hide_test_calls: When true (default), exclude platform_run rows and rows
      with empty MC numbers — same rule as the dashboard "Hide test calls" toggle.

    Returns compact rows: timestamp, mc, carrier, lane, equipment, posted, agreed,
    margin, rounds, outcome, sentiment.
    """
    try:
        fetch_limit = min(max(limit, 1), 200)
        rows = await get_json(
            "/api/metrics/recent-calls",
            params={"days": 30, "limit": fetch_limit},
        )

        if hide_test_calls:
            rows = [r for r in rows if not _is_test_or_incomplete(r)]
        if outcome:
            rows = [r for r in rows if r.get("outcome") == outcome]

        rows = rows[:fetch_limit]
        compact = [_compact_call_row(r) for r in rows]
        return _json_text({"calls": compact, "count": len(compact)})
    except Exception as exc:
        return _json_text(api_error(exc, context="get_recent_calls"))


@mcp.tool()
async def get_call_detail(call_id: str) -> str:
    """Fetch full detail for one call record.

    Use when the user asks to drill into a specific call: transcript, classification
    reasoning, counter-offers, transfer status, or raw webhook payload (e.g. "open
    call ID 42", "show transcript for call 7", "why was this call price rejected?").

    Parameters:
    - call_id: Numeric call id from get_recent_calls or the dashboard call log.

    Returns the full API record including transcript, classification_reasoning,
    counter_offers, transfer_status, and raw_payload when present.
    """
    try:
        cid = int(str(call_id).strip())
        detail = await get_json(f"/api/metrics/calls/{cid}")
        return _json_text(detail)
    except ValueError:
        return _json_text({
            "error": "call_id must be a numeric id",
            "hint": "Use get_recent_calls and pass the call_id field.",
        })
    except Exception as exc:
        return _json_text(api_error(exc, context="get_call_detail"))


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
