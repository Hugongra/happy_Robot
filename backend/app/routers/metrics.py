"""Metrics endpoints powering the dashboard."""
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_api_key
from app.database import get_session, CallRecord
from app.time_utils import to_utc_iso

router = APIRouter(tags=["metrics"], dependencies=[Depends(require_api_key)])

_NEGOTIATED = and_(CallRecord.agreed_rate > 0)
_BOOKED = CallRecord.outcome == "load_booked"


def _since(days: int) -> datetime:
    return datetime.utcnow() - timedelta(days=days)


def _call_to_dict(r: CallRecord, *, include_detail: bool = False) -> dict:
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
        "agreed_rate": r.agreed_rate,
        "num_counter_offers": r.num_counter_offers,
        "counter_offers": r.counter_offers or [],
        "outcome": r.outcome,
        "sentiment": r.sentiment,
        "duration_seconds": r.duration_seconds,
        "broker_margin": round(r.loadboard_rate - r.agreed_rate, 2)
        if r.outcome == "load_booked" and r.loadboard_rate > 0 and r.agreed_rate > 0
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


@router.get("/metrics/summary")
async def summary(days: int = Query(30, ge=1, le=365), session: AsyncSession = Depends(get_session)):
    since = _since(days)
    base = CallRecord.created_at >= since

    total = (await session.execute(
        select(func.count(CallRecord.id)).where(base)
    )).scalar_one()

    booked = (await session.execute(
        select(func.count(CallRecord.id)).where(base, _BOOKED)
    )).scalar_one()

    avg_agreed = (await session.execute(
        select(func.avg(CallRecord.agreed_rate)).where(base, _NEGOTIATED)
    )).scalar_one() or 0

    avg_loadboard = (await session.execute(
        select(func.avg(CallRecord.loadboard_rate))
        .where(base, _NEGOTIATED, CallRecord.loadboard_rate > 0)
    )).scalar_one() or 0

    avg_rounds = (await session.execute(
        select(func.avg(CallRecord.num_counter_offers)).where(base)
    )).scalar_one() or 0

    avg_duration = (await session.execute(
        select(func.avg(CallRecord.duration_seconds)).where(base)
    )).scalar_one() or 0

    ineligible = (await session.execute(
        select(func.count(CallRecord.id))
        .where(base, CallRecord.carrier_eligible == False)  # noqa: E712
    )).scalar_one()

    booked_rows = (await session.execute(
        select(CallRecord.loadboard_rate, CallRecord.agreed_rate)
        .where(base, _BOOKED, CallRecord.loadboard_rate > 0, CallRecord.agreed_rate > 0)
    )).all()
    total_broker_margin = sum(max(lb - ag, 0) for lb, ag in booked_rows)

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
        .where(
            CallRecord.created_at >= since,
            _BOOKED,
            CallRecord.loadboard_rate > 0,
            CallRecord.agreed_rate > 0,
        )
        .order_by(CallRecord.created_at.asc())
        .limit(limit)
    )).scalars().all()

    cumulative = 0.0
    series = []
    for r in rows:
        margin = max(r.loadboard_rate - r.agreed_rate, 0)
        cumulative += margin
        series.append({
            "date": to_utc_iso(r.created_at),
            "label": r.created_at.strftime("%b %d"),
            "margin": round(margin, 2),
            "cumulative_margin": round(cumulative, 2),
            "load_id": r.load_id,
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
    return [_call_to_dict(r, include_detail=True) for r in rows]


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
