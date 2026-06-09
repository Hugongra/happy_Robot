"""Post-call webhook.

The HappyRobot workflow POSTs the extracted fields and classifier outputs here
once the call ends. We persist them in the call_records table for the dashboard.
"""
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_api_key
from app.database import get_session, CallRecord
from app.normalize import normalize_outcome, normalize_sentiment
from app.call_record_utils import normalize_call_fields

router = APIRouter(tags=["webhooks"], dependencies=[Depends(require_api_key)])


class CallEventIn(BaseModel):
    run_id: str = ""
    mc_number: str = ""
    carrier_name: str = ""
    carrier_eligible: bool = False
    load_id: str = ""
    loadboard_rate: float = 0
    agreed_rate: float = 0
    counter_offers: list[float] = Field(default_factory=list)
    origin: str = ""
    destination: str = ""
    equipment_type: str = ""
    outcome: str | bool = "other"           # AI Classify output
    sentiment: str | bool = "neutral"       # Sentiment classifier output
    classification_reasoning: str = ""
    duration_seconds: float = 0
    call_duration_seconds: float = 0        # platform call length (preferred)
    transcript: str = ""
    raw_payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("outcome", "sentiment", mode="before")
    @classmethod
    def _coerce_classifier_fields(cls, v: Any) -> str | bool:
        if v is None:
            return ""
        return v


@router.post("/webhooks/call-completed")
async def call_completed(payload: CallEventIn, session: AsyncSession = Depends(get_session)):
    cleaned = normalize_call_fields(payload.model_dump())
    outcome = normalize_outcome(
        payload.outcome,
        agreed_rate=cleaned["agreed_rate"],
        carrier_eligible=cleaned["carrier_eligible"],
    )
    sentiment = normalize_sentiment(payload.sentiment)

    rec = CallRecord(
        run_id=payload.run_id,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),  # naive UTC for SQLite
        mc_number=cleaned["mc_number"],
        carrier_name=cleaned["carrier_name"],
        carrier_eligible=cleaned["carrier_eligible"],
        load_id=cleaned["load_id"],
        loadboard_rate=cleaned["loadboard_rate"],
        agreed_rate=cleaned["agreed_rate"],
        num_counter_offers=cleaned["num_counter_offers"],
        counter_offers=cleaned["counter_offers"],
        origin=cleaned["origin"],
        destination=cleaned["destination"],
        equipment_type=cleaned["equipment_type"],
        outcome=outcome,
        sentiment=sentiment,
        classification_reasoning=payload.classification_reasoning,
        duration_seconds=cleaned["duration_seconds"],
        transcript=payload.transcript,
        raw_payload=payload.raw_payload or payload.model_dump(),
    )
    session.add(rec)
    await session.commit()
    await session.refresh(rec)
    return {"id": rec.id, "stored": True}
