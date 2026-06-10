"""Metrics endpoints powering the dashboard."""
import asyncio
import time
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_api_key
from app.db import CallRecord, Load, engine, get_session
from app.services.platform_sync import merge_recent_calls, sync_platform_runs_to_db
from app.utils.time import to_utc_iso
from app.utils.call_records import resolve_agreed_rate

router = APIRouter(tags=["metrics"], dependencies=[Depends(require_api_key)])

_sync_lock = asyncio.Lock()
_last_sync_at = 0.0
_SYNC_MIN_INTERVAL = 20.0

_NEGOTIATED = and_(CallRecord.agreed_rate > 0)
_BOOKED = CallRecord.outcome == "load_booked"


def _since(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def _margin_chart_label(created: str, load_id: str) -> str:
    if not created:
        return load_id or ""
    try:
        parsed = datetime.fromisoformat(created.replace("Z", "+00:00"))
        label = parsed.strftime("%b %d %H:%M")
        return f"{label} · {load_id}" if load_id else label
    except ValueError:
        return load_id or created[:10]


def _resolved_agreed(r: CallRecord) -> float:
    reasoning = r.classification_reasoning or ""
    if not reasoning and isinstance(r.raw_payload, dict):
        reasoning = str(r.raw_payload.get("classification_reasoning") or "")
    return resolve_agreed_rate(
        r.agreed_rate,
        r.loadboard_rate,
        r.counter_offers or [],
        classification_reasoning=reasoning,
        transcript=r.transcript or "",
        outcome=r.outcome or "",
    )


def _call_to_dict(r: CallRecord, *, include_detail: bool = False) -> dict:
    agreed = _resolved_agreed(r)
    base = {
        "id": r.id,
        "created_at": to_utc_iso(r.created_at),
        "mc_number": r.mc_number,
        "carrier_name": r.carrier_name,
        "carrier_eligible": r.carrier_eligible,
        "load_id": r.load_id,
        "origin": r.origin,
        "destination": r.destination,
        "equipment_type": r.equipment_type,
        "loadboard_rate": r.loadboard_rate,
        "agreed_rate": agreed,
        "num_counter_offers": r.num_counter_offers,
        "counter_offers": r.counter_offers or [],
        "outcome": r.outcome,
        "sentiment": r.sentiment,
        "duration_seconds": r.duration_seconds,
        "broker_margin": round(r.loadboard_rate - agreed, 2)
        if r.outcome == "load_booked" and r.loadboard_rate > 0 and agreed > 0
        else 0,
    }
    if include_detail:
        reasoning = r.classification_reasoning or ""
        if not reasoning and isinstance(r.raw_payload, dict):
            reasoning = str(r.raw_payload.get("classification_reasoning") or "")
        base.update({
            "transcript": r.transcript or "",
            "classification_reasoning": reasoning,
        })
    return base


def _summary_from_calls(calls: list[dict], days: int) -> dict:
    """Aggregate KPIs from the same merged call list as recent-calls."""
    total = len(calls)
    booked_calls = [c for c in calls if c.get("outcome") == "load_booked"]
    booked = len(booked_calls)
    negotiated = [c for c in calls if (c.get("agreed_rate") or 0) > 0]
    avg_agreed = (sum(c["agreed_rate"] for c in negotiated) / len(negotiated)) if negotiated else 0
    with_lb = [c for c in negotiated if (c.get("loadboard_rate") or 0) > 0]
    avg_loadboard = (sum(c["loadboard_rate"] for c in with_lb) / len(with_lb)) if with_lb else 0
    avg_rounds = (sum(c.get("num_counter_offers") or 0 for c in calls) / total) if total else 0
    avg_duration = (sum(c.get("duration_seconds") or 0 for c in calls) / total) if total else 0
    ineligible = sum(1 for c in calls if c.get("outcome") == "carrier_ineligible")
    total_broker_margin = sum(
        c.get("broker_margin")
        or max((c.get("loadboard_rate") or 0) - (c.get("agreed_rate") or 0), 0)
        for c in booked_calls
    )

    return {
        "window_days": days,
        "total_calls": total,
        "booked_loads": booked,
        "booking_rate": round((booked / total) * 100, 1) if total else 0,
        "avg_agreed_rate": round(float(avg_agreed), 2),
        "avg_loadboard_rate": round(float(avg_loadboard), 2),
        "rate_delta_pct": round(((avg_agreed - avg_loadboard) / avg_loadboard) * 100, 2) if avg_loadboard else 0,
        "avg_negotiation_rounds": round(float(avg_rounds), 2),
        "avg_call_seconds": round(float(avg_duration), 1),
        "fmcsa_rejection_rate": round((ineligible / total) * 100, 1) if total else 0,
        "total_broker_margin": round(total_broker_margin, 2),
    }


@router.get("/metrics/summary")
async def summary(days: int = Query(30, ge=1, le=365), session: AsyncSession = Depends(get_session)):
    since = _since(days)
    rows = (await session.execute(
        select(CallRecord)
        .where(CallRecord.created_at >= since)
        .order_by(CallRecord.created_at.desc())
        .limit(500)
    )).scalars().all()
    merged = await merge_recent_calls(rows, _call_to_dict, days=days, limit=500)
    return _summary_from_calls(merged, days)


@router.get("/metrics/by-outcome")
async def by_outcome(days: int = Query(30, ge=1, le=365), session: AsyncSession = Depends(get_session)):
    since = _since(days)
    rows = (await session.execute(
        select(CallRecord.outcome, func.count(CallRecord.id))
        .where(CallRecord.created_at >= since)
        .group_by(CallRecord.outcome)
    )).all()
    return [{"outcome": r[0], "count": r[1]} for r in rows]


@router.get("/metrics/by-sentiment")
async def by_sentiment(days: int = Query(30, ge=1, le=365), session: AsyncSession = Depends(get_session)):
    since = _since(days)
    rows = (await session.execute(
        select(CallRecord.sentiment, func.count(CallRecord.id))
        .where(CallRecord.created_at >= since)
        .group_by(CallRecord.sentiment)
    )).all()
    return [{"sentiment": r[0], "count": r[1]} for r in rows]


@router.get("/metrics/rounds-distribution")
async def rounds_distribution(days: int = Query(30, ge=1, le=365), session: AsyncSession = Depends(get_session)):
    since = _since(days)
    rows = (await session.execute(
        select(CallRecord.num_counter_offers, func.count(CallRecord.id))
        .where(CallRecord.created_at >= since)
        .group_by(CallRecord.num_counter_offers)
        .order_by(CallRecord.num_counter_offers.asc())
    )).all()
    return [{"rounds": r[0], "count": r[1]} for r in rows]


@router.get("/metrics/margin-evolution")
async def margin_evolution(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
):
    """Cumulative broker margin over booked calls, ordered by time."""
    since = _since(days)
    rows = (await session.execute(
        select(CallRecord)
        .where(CallRecord.created_at >= since)
        .order_by(CallRecord.created_at.desc())
        .limit(limit * 3)
    )).scalars().all()
    merged = await merge_recent_calls(rows, _call_to_dict, days=days, limit=limit * 3)
    booked = [
        c for c in merged
        if c.get("outcome") == "load_booked"
        and (c.get("loadboard_rate") or 0) > 0
        and (c.get("agreed_rate") or 0) > 0
    ]
    booked.sort(key=lambda c: c.get("created_at") or "")

    cumulative = 0.0
    series = []
    for c in booked[:limit]:
        margin = max((c.get("loadboard_rate") or 0) - (c.get("agreed_rate") or 0), 0)
        cumulative += margin
        created = c.get("created_at") or ""
        label = _margin_chart_label(created, c.get("load_id") or "")
        series.append({
            "date": created,
            "label": label,
            "margin": round(margin, 2),
            "cumulative_margin": round(cumulative, 2),
            "load_id": c.get("load_id") or "",
        })
    return series


@router.get("/metrics/recent-calls")
async def recent_calls(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(25, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
):
    since = _since(days)
    rows = (await session.execute(
        select(CallRecord)
        .where(CallRecord.created_at >= since)
        .order_by(CallRecord.created_at.desc())
        .limit(limit)
    )).scalars().all()
    return await merge_recent_calls(
        rows,
        _call_to_dict,
        days=days,
        limit=limit,
    )


@router.post("/metrics/sync-happyrobot")
async def sync_happyrobot(session: AsyncSession = Depends(get_session)):
    """Backfill call_records from HappyRobot platform runs (AI Extract / Classify)."""
    global _last_sync_at
    now = time.monotonic()
    if _sync_lock.locked():
        return {"skipped": True, "reason": "in_progress"}
    if now - _last_sync_at < _SYNC_MIN_INTERVAL:
        return {"skipped": True, "reason": "throttled", "retry_after_seconds": int(_SYNC_MIN_INTERVAL - (now - _last_sync_at))}

    async with _sync_lock:
        _last_sync_at = time.monotonic()
        return await sync_platform_runs_to_db(session)


@router.get("/metrics/calls/{call_id}")
async def get_call(call_id: int, session: AsyncSession = Depends(get_session)):
    row = (await session.execute(
        select(CallRecord).where(CallRecord.id == call_id)
    )).scalar_one_or_none()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Call not found")
    return _call_to_dict(row, include_detail=True)


# Legacy endpoint — kept for backwards compatibility
@router.get("/metrics/rate-vs-loadboard")
async def rate_vs_loadboard(
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(50, ge=1, le=500),
    session: AsyncSession = Depends(get_session),
):
    since = _since(days)
    rows = (await session.execute(
        select(CallRecord)
        .where(CallRecord.created_at >= since, _NEGOTIATED)
        .order_by(CallRecord.created_at.desc())
        .limit(limit)
    )).scalars().all()
    return [
        {
            "load_id": r.load_id,
            "loadboard_rate": r.loadboard_rate,
            "agreed_rate": r.agreed_rate,
            "rounds": r.num_counter_offers,
        }
        for r in rows
    ]
