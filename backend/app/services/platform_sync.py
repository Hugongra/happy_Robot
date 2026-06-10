"""Merge HappyRobot platform runs with webhook call_records."""
from __future__ import annotations

import zlib
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CallRecord
from app.integrations.happyrobot import cached_list_workflow_runs, configured
from app.services.run_reconstruction import (
    is_sparse_record,
    payload_to_record_fields,
    reconstruct_run_payload,
)
from app.utils.time import parse_utc_iso, to_utc_iso

_MATCH_WINDOW = timedelta(minutes=40)


def _should_rehydrate(row: CallRecord, fields: dict[str, Any]) -> bool:
    if is_sparse_record(row):
        return True
    if fields.get("agreed_rate", 0) > 0 and row.agreed_rate <= 0:
        return True
    if fields.get("transcript") and not (row.transcript or "").strip():
        return True
    if fields.get("mc_number") and not row.mc_number:
        return True
    return False


def virtual_call_id(run_id: str) -> int:
    return -int(zlib.crc32(run_id.encode()) & 0x7FFFFFFF)


def _parse_platform_ts(run: dict[str, Any]) -> datetime | None:
    for key in ("completed_at", "timestamp"):
        raw = run.get(key)
        if raw:
            return parse_utc_iso(str(raw))
    return None


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _find_db_match(
    run: dict[str, Any],
    db_rows: list[CallRecord],
    used_ids: set[int],
) -> CallRecord | None:
    run_id = str(run.get("id") or "")
    platform_at = _parse_platform_ts(run)

    for row in db_rows:
        if row.id in used_ids:
            continue
        if row.run_id and row.run_id == run_id:
            return row

    if not platform_at:
        return None

    best: CallRecord | None = None
    best_delta = _MATCH_WINDOW
    platform_naive = _naive_utc(platform_at)
    for row in db_rows:
        if row.id in used_ids or row.run_id:
            continue
        delta = abs(row.created_at - platform_naive)
        if delta <= best_delta:
            best = row
            best_delta = delta
    return best


def _apply_fields(row: CallRecord, fields: dict[str, Any], *, run_id: str, platform_at: datetime | None) -> None:
    row.run_id = run_id or row.run_id
    if platform_at and is_sparse_record(row):
        row.created_at = _naive_utc(platform_at)
    row.mc_number = fields["mc_number"]
    name = (fields.get("carrier_name") or "").strip()
    if not name and fields.get("transcript"):
        name = "Unknown caller"
    elif not name and row.carrier_name == "HappyRobot run":
        name = "Unknown caller"
    row.carrier_name = name or row.carrier_name or "Unknown carrier"
    row.carrier_eligible = fields["carrier_eligible"]
    row.load_id = fields["load_id"]
    row.loadboard_rate = fields["loadboard_rate"]
    row.agreed_rate = fields["agreed_rate"]
    row.num_counter_offers = fields["num_counter_offers"]
    row.counter_offers = fields["counter_offers"]
    row.origin = fields["origin"]
    row.destination = fields["destination"]
    row.equipment_type = fields["equipment_type"]
    row.outcome = fields["outcome"]
    row.sentiment = fields["sentiment"]
    row.classification_reasoning = fields["classification_reasoning"]
    row.duration_seconds = fields["duration_seconds"]
    row.transcript = fields["transcript"]
    row.raw_payload = fields["raw_payload"]


async def _build_fields_for_run(run_id: str) -> dict[str, Any] | None:
    payload = await reconstruct_run_payload(run_id)
    if not payload:
        return None
    return payload_to_record_fields(payload)


def _platform_stub(run: dict[str, Any]) -> dict[str, Any]:
    run_id = str(run.get("id") or "")
    platform_at = _parse_platform_ts(run)
    created = to_utc_iso(platform_at) if platform_at else to_utc_iso(datetime.utcnow())
    return {
        "id": virtual_call_id(run_id),
        "run_id": run_id,
        "created_at": created,
        "mc_number": "",
        "carrier_name": "HappyRobot run",
        "carrier_eligible": False,
        "load_id": "",
        "origin": "",
        "destination": "",
        "equipment_type": "",
        "loadboard_rate": 0,
        "agreed_rate": 0,
        "num_counter_offers": 0,
        "counter_offers": [],
        "outcome": "platform_run",
        "sentiment": "neutral",
        "duration_seconds": 0,
        "broker_margin": 0,
        "transcript": "",
        "classification_reasoning": "Run completed on HappyRobot — reconstructing call data.",
        "sync_source": "platform",
        "platform_status": str(run.get("status") or "completed"),
    }


def _dedupe_db_rows(db_rows: list[CallRecord]) -> list[CallRecord]:
    """Keep the newest row per run_id; preserve rows without run_id."""
    by_run_id: dict[str, CallRecord] = {}
    extras: list[CallRecord] = []
    for row in db_rows:
        if row.run_id:
            existing = by_run_id.get(row.run_id)
            if not existing or row.created_at > existing.created_at:
                by_run_id[row.run_id] = row
        else:
            extras.append(row)
    combined = list(by_run_id.values()) + extras
    combined.sort(key=lambda r: r.created_at, reverse=True)
    return combined


def _db_only_calls(db_rows: list[CallRecord], call_to_dict, *, limit: int) -> list[dict[str, Any]]:
    deduped = _dedupe_db_rows(db_rows)
    return [
        enrich_call_dict(call_to_dict(r, include_detail=True), run_id=r.run_id or "")
        for r in deduped[:limit]
    ]


def enrich_call_dict(base: dict[str, Any], *, run_id: str = "", sync_source: str = "webhook") -> dict[str, Any]:
    out = dict(base)
    out["run_id"] = run_id or out.get("run_id") or ""
    out["sync_source"] = sync_source
    out.setdefault("platform_status", "")
    return out


async def merge_recent_calls(
    db_rows: list[CallRecord],
    call_to_dict,
    *,
    days: int,
    limit: int,
) -> list[dict[str, Any]]:
    """Platform runs enriched with DB rows when available."""
    if not configured():
        return _db_only_calls(db_rows, call_to_dict, limit=limit)

    since = datetime.utcnow() - timedelta(days=days)
    try:
        platform_runs = await cached_list_workflow_runs(limit=max(limit, 50))
    except Exception:
        return _db_only_calls(db_rows, call_to_dict, limit=limit)

    if not platform_runs:
        return _db_only_calls(db_rows, call_to_dict, limit=limit)

    used_db_ids: set[int] = set()
    merged: list[dict[str, Any]] = []

    for run in platform_runs:
        platform_at = _parse_platform_ts(run)
        if platform_at and _naive_utc(platform_at) < since:
            continue

        run_id = str(run.get("id") or "")
        match = _find_db_match(run, db_rows, used_db_ids)
        if match:
            used_db_ids.add(match.id)
            merged.append(enrich_call_dict(
                call_to_dict(match, include_detail=True),
                run_id=run_id or match.run_id,
                sync_source="webhook",
            ))
        else:
            merged.append(_platform_stub(run))

    merged.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return merged[:limit]


async def sync_platform_runs_to_db(session: AsyncSession) -> dict[str, int]:
    """Backfill or repair call_records from HappyRobot tool outputs."""
    if not configured():
        return {"platform_runs": 0, "created": 0, "updated": 0, "linked": 0, "skipped": 0}

    platform_runs = await cached_list_workflow_runs(limit=100)
    db_rows = (await session.execute(select(CallRecord).order_by(CallRecord.created_at.desc()))).scalars().all()
    existing_run_ids = {r.run_id for r in db_rows if r.run_id}
    used_ids: set[int] = set()
    created = updated = linked = skipped = 0

    for run in platform_runs:
        run_id = str(run.get("id") or "")
        if not run_id:
            skipped += 1
            continue

        fields = await _build_fields_for_run(run_id)
        if not fields:
            skipped += 1
            continue

        platform_at = _parse_platform_ts(run)
        match = _find_db_match(run, db_rows, used_ids)

        if match:
            used_ids.add(match.id)
            if not match.run_id:
                match.run_id = run_id
                linked += 1
            if _should_rehydrate(match, fields) or fields.get("transcript") or fields.get("agreed_rate", 0) > 0:
                _apply_fields(match, fields, run_id=run_id, platform_at=platform_at)
                updated += 1
            continue

        if run_id in existing_run_ids:
            skipped += 1
            continue

        created_at = _naive_utc(platform_at) if platform_at else datetime.utcnow()
        rec = CallRecord(
            run_id=run_id,
            created_at=created_at,
            mc_number=fields["mc_number"],
            carrier_name=fields["carrier_name"] or "Unknown carrier",
            carrier_eligible=fields["carrier_eligible"],
            load_id=fields["load_id"],
            loadboard_rate=fields["loadboard_rate"],
            agreed_rate=fields["agreed_rate"],
            num_counter_offers=fields["num_counter_offers"],
            counter_offers=fields["counter_offers"],
            origin=fields["origin"],
            destination=fields["destination"],
            equipment_type=fields["equipment_type"],
            outcome=fields["outcome"],
            sentiment=fields["sentiment"],
            classification_reasoning=fields["classification_reasoning"],
            duration_seconds=fields["duration_seconds"],
            transcript=fields["transcript"],
            raw_payload=fields["raw_payload"],
        )
        session.add(rec)
        existing_run_ids.add(run_id)
        created += 1

    if created or updated or linked:
        await session.commit()

    return {
        "platform_runs": len(platform_runs),
        "created": created,
        "updated": updated,
        "linked": linked,
        "skipped": skipped,
    }
