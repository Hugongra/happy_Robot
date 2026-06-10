"""Post-call webhook.

The HappyRobot workflow POSTs the extracted fields and classifier outputs here
once the call ends. We persist them in the call_records table for the dashboard.
"""
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_api_key
from app.db import CallRecord, get_session
from app.utils.normalize import normalize_outcome, normalize_sentiment
from app.utils.call_records import coerce_webhook_payload, normalize_call_fields

logger = logging.getLogger(__name__)

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
    outcome: str | bool = "other"
    sentiment: str | bool = "neutral"
    classification_reasoning: str = ""
    duration_seconds: float = 0
    call_duration_seconds: float = 0
    transcript: str = ""
    raw_payload: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _coerce_payload(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return coerce_webhook_payload(data)
        return {}

    @field_validator("outcome", "sentiment", mode="before")
    @classmethod
    def _coerce_classifier_fields(cls, v: Any) -> str | bool:
        if v is None:
            return ""
        return v


def _parse_body(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    return {}


def _is_unresolved(value: Any) -> bool:
    return isinstance(value, str) and value.strip().startswith("@")


def is_happyrobot_test_payload(raw: dict[str, Any], body: dict[str, Any]) -> bool:
    """Detect HappyRobot 'Test the node' payloads with unresolved @ placeholders."""
    raw_run_id = str(raw.get("run_id") or "")
    if _is_unresolved(raw_run_id) or raw_run_id in ("current.run_id",):
        return True

    unresolved = sum(1 for v in raw.values() if _is_unresolved(v))
    if unresolved >= 2:
        return True

    # After coercion everything is empty — typical platform test with no real call
    if not body.get("run_id") and not body.get("mc_number") and not body.get("transcript"):
        if unresolved >= 1 or not raw:
            return True
    return False


@router.post("/webhooks/call-completed")
async def call_completed(request: Request, session: AsyncSession = Depends(get_session)):
    """Always returns HTTP 200 when auth passes — HappyRobot must never see 422/502."""
    raw: dict[str, Any] = {}
    try:
        try:
            parsed = await request.json()
            raw = _parse_body(parsed)
        except Exception as exc:
            logger.warning("webhook invalid JSON: %s", exc)
            raw = {}

        logger.info("webhook payload keys: %s", list(raw.keys()))

        body = coerce_webhook_payload(raw)
        if is_happyrobot_test_payload(raw, body):
            logger.info("webhook platform test detected — skipping DB write")
            return {
                "stored": False,
                "test": True,
                "message": "HappyRobot test payload received OK",
            }

        try:
            payload = CallEventIn.model_validate({**body, "raw_payload": raw})
        except Exception as exc:
            logger.warning("webhook pydantic fallback: %s", exc)
            payload = CallEventIn(raw_payload=raw)

        cleaned = normalize_call_fields(payload.model_dump(), outcome=str(payload.outcome or ""))
        outcome = normalize_outcome(
            payload.outcome,
            agreed_rate=cleaned["agreed_rate"],
            carrier_eligible=cleaned["carrier_eligible"],
        )
        sentiment = normalize_sentiment(payload.sentiment)

        run_id = str(payload.run_id or "").strip()
        existing: CallRecord | None = None
        if run_id:
            existing = (await session.execute(
                select(CallRecord).where(CallRecord.run_id == run_id)
            )).scalar_one_or_none()

        if existing:
            rec = existing
        else:
            rec = CallRecord(
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )

        rec.run_id = run_id
        rec.mc_number = cleaned["mc_number"]
        rec.carrier_name = cleaned["carrier_name"] or rec.carrier_name or ""
        rec.carrier_eligible = cleaned["carrier_eligible"]
        rec.load_id = cleaned["load_id"]
        rec.loadboard_rate = cleaned["loadboard_rate"]
        rec.agreed_rate = cleaned["agreed_rate"]
        rec.num_counter_offers = cleaned["num_counter_offers"]
        rec.counter_offers = cleaned["counter_offers"]
        rec.origin = cleaned["origin"]
        rec.destination = cleaned["destination"]
        rec.equipment_type = cleaned["equipment_type"]
        rec.outcome = outcome
        rec.sentiment = sentiment
        rec.classification_reasoning = payload.classification_reasoning or rec.classification_reasoning or ""
        rec.duration_seconds = cleaned["duration_seconds"]
        if payload.transcript:
            rec.transcript = payload.transcript
        rec.raw_payload = payload.raw_payload or raw

        if not existing:
            session.add(rec)
        await session.commit()
        await session.refresh(rec)
        return {"id": rec.id, "stored": True, "updated": existing is not None, "test": False}

    except Exception as exc:
        logger.exception("webhook handler error: %s", exc)
        try:
            await session.rollback()
        except Exception:
            pass
        # Still return 200 so HappyRobot marks the node succeeded; error is logged in Fly.
        return {
            "stored": False,
            "test": False,
            "error": "handler_error",
            "message": str(exc),
        }
