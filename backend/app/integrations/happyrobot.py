"""HappyRobot platform API client + short-lived runs cache."""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.settings import settings

_TIMEOUT = 12.0
_CACHE_TTL = 120.0
_STALE_TTL = 600.0
_FETCH_TIMEOUT = 12.0

_lock = asyncio.Lock()
_runs_cache: dict[str, Any] = {"ts": 0.0, "runs": []}


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.happyrobot_api_key}"}


def configured() -> bool:
    return bool(settings.happyrobot_api_key and settings.happyrobot_workflow_id)


async def list_workflow_runs(
    *,
    environment: str = "production",
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Return completed workflow runs newest-first."""
    if not configured():
        return []

    wf = settings.happyrobot_workflow_id
    url = f"{settings.happyrobot_base_url}/workflows/{wf}/runs"
    runs: list[dict[str, Any]] = []
    page = 1

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        while len(runs) < limit:
            r = await client.get(
                url,
                headers=_headers(),
                params={"environment": environment, "limit": min(50, limit - len(runs)), "page": page},
            )
            r.raise_for_status()
            body = r.json()
            batch = body.get("data") if isinstance(body, dict) else body
            if not isinstance(batch, list) or not batch:
                break
            runs.extend(batch)
            pagination = body.get("pagination") if isinstance(body, dict) else None
            if not pagination or not pagination.get("has_more"):
                break
            page += 1

    return runs[:limit]


async def cached_list_workflow_runs(*, limit: int = 50) -> list[dict[str, Any]]:
    """Return workflow runs with TTL cache and stale fallback on upstream errors."""
    async with _lock:
        age = time.monotonic() - _runs_cache["ts"]
        if _runs_cache["runs"] and age < _CACHE_TTL:
            return _runs_cache["runs"][:limit]

    try:
        runs = await asyncio.wait_for(list_workflow_runs(limit=limit), timeout=_FETCH_TIMEOUT)
    except Exception:
        async with _lock:
            if _runs_cache["runs"] and (time.monotonic() - _runs_cache["ts"]) < _STALE_TTL:
                return _runs_cache["runs"][:limit]
        raise

    async with _lock:
        _runs_cache["ts"] = time.monotonic()
        _runs_cache["runs"] = runs
    return runs[:limit]


async def list_run_nodes(run_id: str) -> list[dict[str, Any]]:
    if not settings.happyrobot_api_key:
        return []
    url = f"{settings.happyrobot_base_url}/runs/{run_id}/nodes"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(url, headers=_headers())
        r.raise_for_status()
        body = r.json()
        nodes = body.get("data") if isinstance(body, dict) else body
        return nodes if isinstance(nodes, list) else []


async def get_run_output(run_id: str, output_id: str) -> dict[str, Any] | None:
    if not settings.happyrobot_api_key:
        return None
    url = f"{settings.happyrobot_base_url}/runs/{run_id}/outputs/{output_id}"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(url, headers=_headers())
        if r.status_code != 200:
            return None
        body = r.json()
        data = body.get("data") if isinstance(body, dict) else body
        return data if isinstance(data, dict) else None


async def list_run_sessions(run_id: str) -> list[dict[str, Any]]:
    if not settings.happyrobot_api_key:
        return []
    url = f"{settings.happyrobot_base_url}/runs/{run_id}/sessions"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        r = await client.get(url, headers=_headers())
        if r.status_code != 200:
            return []
        body = r.json()
        data = body.get("data") if isinstance(body, dict) else body
        return data if isinstance(data, list) else []


async def fetch_run_telemetry(run_id: str) -> dict[str, Any]:
    """Pull AI Extract + AI Classify outputs for a run."""
    extract: dict[str, Any] = {}
    classify: dict[str, Any] = {}
    nodes = await list_run_nodes(run_id)
    for node in nodes:
        name = str(node.get("name") or "")
        output_id = node.get("output_id")
        if not output_id:
            continue
        if "AI Extract" in name and not extract:
            out = await get_run_output(run_id, output_id)
            if out and isinstance(out.get("data"), dict):
                resp = out["data"].get("response")
                if isinstance(resp, dict):
                    extract = resp
        elif "AI Classify" in name and not classify:
            out = await get_run_output(run_id, output_id)
            if out and isinstance(out.get("data"), dict):
                resp = out["data"].get("response")
                if isinstance(resp, dict):
                    classify = resp
    return {"extract": extract, "classify": classify}
