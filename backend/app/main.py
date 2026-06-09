"""FastAPI app entrypoint.

Endpoints:

  POST   /api/voice/token              — issue LiveKit token (browser → server)
  GET    /api/loads/search             — search loads (HappyRobot tool webhook)
  GET    /api/loads/{load_id}          — fetch one load
  POST   /api/loads/evaluate-offer     — server-side negotiation policy
  POST   /api/fmcsa/verify             — verify a carrier by MC number
  POST   /api/webhooks/call-completed  — post-call data sink
  GET    /api/metrics/*                — dashboard data
  GET    /healthz                      — liveness check

All endpoints except /healthz and /api/voice/token require X-API-Key.
"""
import json
import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.settings import settings
from app.database import init_db, SessionLocal, Load, CallRecord, engine
from app.normalize import normalize_outcome, normalize_sentiment
from app.call_record_utils import normalize_call_fields
from app.routers import loads as loads_router
from app.routers import voice as voice_router
from app.routers import webhooks as webhooks_router
from app.routers import metrics as metrics_router
from app.routers import fmcsa as fmcsa_router


async def _seed_loads_if_empty() -> None:
    """Seed loads from app/seed_loads.json if table is empty."""
    async with SessionLocal() as session:
        existing = (await session.execute(select(Load).limit(1))).scalar_one_or_none()
        if existing:
            return
        seed_path = Path(__file__).parent / "seed_loads.json"
        if not seed_path.exists():
            return
        with seed_path.open() as f:
            rows = json.load(f)
        for row in rows:
            session.add(Load(**row))
        await session.commit()


async def _normalize_call_records() -> None:
    """Re-normalize legacy rows with bad extract / timezone / rate data."""
    async with SessionLocal() as session:
        rows = (await session.execute(select(CallRecord))).scalars().all()
        changed = False
        for rec in rows:
            cleaned = normalize_call_fields({
                "mc_number": rec.mc_number,
                "carrier_name": rec.carrier_name,
                "carrier_eligible": rec.carrier_eligible,
                "load_id": rec.load_id,
                "loadboard_rate": rec.loadboard_rate,
                "agreed_rate": rec.agreed_rate,
                "counter_offers": rec.counter_offers or [],
                "origin": rec.origin,
                "destination": rec.destination,
                "equipment_type": rec.equipment_type,
                "duration_seconds": rec.duration_seconds,
                "call_duration_seconds": 0,
            })
            outcome = normalize_outcome(
                rec.outcome,
                agreed_rate=cleaned["agreed_rate"],
                carrier_eligible=cleaned["carrier_eligible"],
            )
            sentiment = normalize_sentiment(rec.sentiment)

            for field in (
                "mc_number", "carrier_name", "carrier_eligible", "load_id",
                "loadboard_rate", "agreed_rate", "num_counter_offers",
                "origin", "destination", "equipment_type", "duration_seconds",
            ):
                if getattr(rec, field) != cleaned[field]:
                    setattr(rec, field, cleaned[field])
                    changed = True
            if rec.outcome != outcome:
                rec.outcome = outcome
                changed = True
            if rec.sentiment != sentiment:
                rec.sentiment = sentiment
                changed = True
        if changed:
            await session.commit()


async def _migrate_schema() -> None:
    """Lightweight SQLite migrations for new columns."""
    async with engine.begin() as conn:
        result = await conn.exec_driver_sql("PRAGMA table_info(call_records)")
        cols = {row[1] for row in result.fetchall()}
        if "classification_reasoning" not in cols:
            await conn.exec_driver_sql(
                "ALTER TABLE call_records ADD COLUMN classification_reasoning TEXT DEFAULT ''"
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure ./data directory exists for SQLite
    db_dir = Path("data")
    db_dir.mkdir(exist_ok=True)
    await init_db()
    await _migrate_schema()
    await _seed_loads_if_empty()
    await _normalize_call_records()
    yield


app = FastAPI(title="Acme Logistics — Carrier Sales API", version="1.0.0", lifespan=lifespan)

# CORS
origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


app.include_router(loads_router.router, prefix="/api")
app.include_router(voice_router.router, prefix="/api")
app.include_router(webhooks_router.router, prefix="/api")
app.include_router(metrics_router.router, prefix="/api")
app.include_router(fmcsa_router.router, prefix="/api")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=False)
