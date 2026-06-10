"""Loads API. Exposed to the HappyRobot voice agent via webhook tool node."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_api_key
from app.db import Load, get_session
from app.utils.search import normalize_equipment, normalize_location, sanitize_query_param

router = APIRouter(tags=["loads"], dependencies=[Depends(require_api_key)])


class LoadOut(BaseModel):
    load_id: str
    origin: str
    destination: str
    pickup_datetime: str
    delivery_datetime: str
    equipment_type: str
    loadboard_rate: float
    notes: str
    weight: float
    commodity_type: str
    num_of_pieces: int
    miles: float
    dimensions: str

    @classmethod
    def from_orm_load(cls, l: Load) -> "LoadOut":
        # NOTE: min_acceptable_rate is intentionally NOT returned — internal only.
        return cls(
            load_id=l.load_id, origin=l.origin, destination=l.destination,
            pickup_datetime=l.pickup_datetime, delivery_datetime=l.delivery_datetime,
            equipment_type=l.equipment_type, loadboard_rate=l.loadboard_rate,
            notes=l.notes, weight=l.weight, commodity_type=l.commodity_type,
            num_of_pieces=l.num_of_pieces, miles=l.miles, dimensions=l.dimensions,
        )


async def _query_loads(
    session: AsyncSession,
    *,
    origin: str | None,
    destination: str | None,
    equipment_type: str | None,
    limit: int,
) -> list[Load]:
    stmt = select(Load)
    if origin:
        stmt = stmt.where(func.lower(Load.origin).contains(origin.lower()))
    if destination:
        stmt = stmt.where(func.lower(Load.destination).contains(destination.lower()))
    if equipment_type:
        stmt = stmt.where(func.lower(Load.equipment_type) == equipment_type.lower())
    stmt = stmt.order_by(Load.pickup_datetime.asc()).limit(limit)
    return list((await session.execute(stmt)).scalars().all())


@router.get("/loads/search", response_model=list[LoadOut])
async def search_loads(
    origin: Optional[str] = Query(None, description="Free-text origin city/state"),
    destination: Optional[str] = Query(None, description="Free-text destination city/state"),
    equipment_type: Optional[str] = Query(None, description="e.g. 'Dry Van', 'Reefer', 'Flatbed'"),
    limit: int = Query(3, ge=1, le=10),
    session: AsyncSession = Depends(get_session),
):
    """Fuzzy search by origin / destination / equipment. Tolerates STT typos and voice phrasing."""
    origin_q = normalize_location(origin)
    dest_q = normalize_location(destination)
    equip_q = normalize_equipment(equipment_type)

    # Drop unresolved placeholders that slipped through
    if sanitize_query_param(origin) is None:
        origin_q = None
    if sanitize_query_param(destination) is None:
        dest_q = None
    if sanitize_query_param(equipment_type) is None:
        equip_q = None

    # Try strictest match first, then relax filters until we find results
    attempts: list[tuple[str | None, str | None, str | None]] = [
        (origin_q, dest_q, equip_q),
        (origin_q, dest_q, None),
        (origin_q, None, equip_q),
        (origin_q, None, None),
        (None, dest_q, equip_q),
        (None, None, equip_q),
    ]

    seen: set[str] = set()
    results: list[Load] = []
    for o, d, e in attempts:
        if o is None and d is None and e is None:
            continue
        batch = await _query_loads(session, origin=o, destination=d, equipment_type=e, limit=limit)
        for load in batch:
            if load.load_id not in seen:
                seen.add(load.load_id)
                results.append(load)
        if len(results) >= limit:
            break

    return [LoadOut.from_orm_load(l) for l in results[:limit]]


@router.get("/loads/{load_id}", response_model=LoadOut)
async def get_load(load_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.execute(select(Load).where(Load.load_id == load_id))
    load = result.scalar_one_or_none()
    if not load:
        raise HTTPException(status_code=404, detail="Load not found")
    return LoadOut.from_orm_load(load)


class EvaluateOfferIn(BaseModel):
    load_id: str
    carrier_offer: float
    round_number: int  # 1, 2, or 3
    last_broker_offer: Optional[float] = None  # broker's previous counter, if any


class EvaluateOfferOut(BaseModel):
    decision: str         # "accept", "counter", "reject"
    broker_counter: float # the price to offer back (0 if accept/reject)
    rationale: str        # short explanation for the agent to use in dialog
    floor_rate: float     # echoed back so the agent has it in context (internal — do not say to carrier)


@router.post("/loads/evaluate-offer", response_model=EvaluateOfferOut, dependencies=[Depends(require_api_key)])
async def evaluate_offer(payload: EvaluateOfferIn, session: AsyncSession = Depends(get_session)):
    """Server-side negotiation policy. The voice agent calls this each round
    instead of computing math itself (LLMs are unreliable with numbers)."""
    load = (await session.execute(select(Load).where(Load.load_id == payload.load_id))).scalar_one_or_none()
    if not load:
        raise HTTPException(status_code=404, detail="Load not found")

    floor = load.min_acceptable_rate or (load.loadboard_rate * 0.92)
    posted = load.loadboard_rate
    offer = payload.carrier_offer
    rnd = payload.round_number

    # Carrier offered at or above what we'd accept → done.
    if offer >= posted:
        return EvaluateOfferOut(decision="accept", broker_counter=0,
                                rationale="Carrier offer meets or exceeds posted rate.",
                                floor_rate=floor)
    if offer >= floor and rnd >= 2:
        # By round 2/3, anything above floor is acceptable rather than risk losing the load.
        return EvaluateOfferOut(decision="accept", broker_counter=0,
                                rationale="Offer above floor in late round — accept.", floor_rate=floor)

    # Otherwise, counter or reject depending on round.
    if rnd >= 3:
        # Final round: meet at floor if their offer is at least 95% of floor, else reject.
        if offer >= floor * 0.95:
            return EvaluateOfferOut(decision="counter", broker_counter=round(floor, 0),
                                    rationale="Final round — counter at floor.", floor_rate=floor)
        return EvaluateOfferOut(decision="reject", broker_counter=0,
                                rationale="Offer too low after 3 rounds. Reject politely.",
                                floor_rate=floor)

    # Round 1 / 2 counter: meet in the middle, biased toward our side.
    # broker_counter = midpoint between max(offer, floor) and posted, leaning ~60% to posted.
    base = max(offer, floor)
    counter = round(base + (posted - base) * 0.6, 0)
    # Don't counter below previous broker offer if any.
    if payload.last_broker_offer:
        counter = max(counter, payload.last_broker_offer - 25)
    return EvaluateOfferOut(decision="counter", broker_counter=counter,
                            rationale="Counter between carrier offer and posted rate.",
                            floor_rate=floor)
