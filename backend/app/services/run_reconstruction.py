"""Rebuild call_records from HappyRobot tool outputs + voice agent transcript."""
from __future__ import annotations

import json
import re
from typing import Any

from app.utils.call_records import normalize_call_fields
from app.integrations.happyrobot import get_run_output, list_run_nodes, list_run_sessions
from app.utils.normalize import normalize_outcome, normalize_sentiment

_NODE_FMCSA = "FMCSA Verify"
_NODE_SEARCH = "Search Loads API"
_NODE_EVALUATE = "Evaluate Offer API"
_NODE_VOICE = "Inbound Voice Agent"
_NODE_TRANSFER = "transfer_to_sales_rep"
_NODE_CLASSIFY = "AI Classify - Telemetry"


def _node_data(output: dict[str, Any] | None) -> dict[str, Any]:
    if not output:
        return {}
    if "node_type" in output:
        inner = output.get("data")
        if isinstance(inner, dict):
            if isinstance(inner.get("response"), dict):
                return inner
            if isinstance(inner.get("data"), dict):
                return inner["data"]
            return inner
        return {}
    data = output.get("data")
    if isinstance(data, dict) and isinstance(data.get("data"), dict):
        return data["data"]
    if isinstance(data, dict):
        return data
    return {}


def _parse_transcript_messages(raw: Any) -> list[dict[str, Any]]:
    if not raw:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _transcript_text(messages: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for msg in messages:
        role = msg.get("role") or ""
        content = str(msg.get("content") or "").strip()
        if not content or role == "tool":
            continue
        prefix = "Agent" if role == "assistant" else "Carrier"
        clean = re.sub(r"^\[[a-z]{2}\]\s*", "", content)
        lines.append(f"{prefix}: {clean}")
    return "\n".join(lines)


def _clean_name(name: str) -> str:
    name = re.sub(r"[.,!?;:]+$", "", (name or "").strip())
    m = re.search(r"\bfrom\s+([A-Za-z][A-Za-z0-9 .'-]+?)(?:\.|,|\s+my\b|$)", name, re.I)
    if m:
        return _clean_name(m.group(1))
    if "mc number" in name.lower():
        name = name.split(".")[0].strip()
    return name[:48]


def _carrier_name_from_transcript(messages: list[dict[str, Any]]) -> str:
    for msg in messages:
        if msg.get("role") != "user":
            continue
        content = str(msg.get("content") or "")
        m = re.search(
            r"^[A-Za-z][A-Za-z'-]+\s+from\s+([A-Za-z][A-Za-z0-9 .'-]+?)(?:\.|,|\s+my\b|$)",
            content.strip(),
            re.I,
        )
        if m:
            return _clean_name(m.group(1))
        m = re.search(
            r"(?:this is|my name is|i am|i'm)\s+[A-Za-z][A-Za-z'-]+\s+from\s+([A-Za-z][A-Za-z0-9 .'-]+?)(?:\.|,|\s+my\b|$)",
            content,
            re.I,
        )
        if m:
            return _clean_name(m.group(1))
        m = re.search(r"(?:this is|my name is|i am|i'm)\s+([A-Za-z][A-Za-z'-]+)", content, re.I)
        if m:
            return _clean_name(m.group(1))
    return ""


def _mc_from_transcript(messages: list[dict[str, Any]]) -> str:
    for msg in messages:
        if msg.get("role") != "user":
            continue
        content = str(msg.get("content") or "")
        if "mc" not in content.lower() and not re.search(r"\d{5,}", content):
            continue
        digits = re.sub(r"\D", "", content)
        if len(digits) >= 5:
            return digits[:6] if len(digits) >= 6 else digits
    return ""


def _fmcsa_from_transcript(messages: list[dict[str, Any]]) -> dict[str, Any]:
    for msg in messages:
        if msg.get("role") == "tool" and msg.get("name") == "verify_carrier":
            try:
                data = json.loads(msg.get("content") or "{}")
            except json.JSONDecodeError:
                data = {}
            if data:
                return data
    return {}


def _had_transfer(messages: list[dict[str, Any]], by_name: dict[str, list[dict[str, Any]]]) -> bool:
    if _NODE_TRANSFER in by_name:
        return True
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        for tc in msg.get("tool_calls") or []:
            if (tc.get("function") or {}).get("name") == _NODE_TRANSFER:
                return True
        if "transfer" in str(msg.get("content") or "").lower():
            return True
    return False


def _evaluate_rounds(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pair evaluate_offer tool calls with their API responses in order."""
    pending: list[dict[str, Any]] = []
    rounds: list[dict[str, Any]] = []
    for msg in messages:
        if msg.get("role") == "assistant" and msg.get("tool_calls"):
            for tc in msg["tool_calls"]:
                fn = (tc.get("function") or {}).get("name")
                if fn != "evaluate_offer":
                    continue
                try:
                    args = json.loads((tc.get("function") or {}).get("arguments") or "{}")
                except json.JSONDecodeError:
                    args = {}
                pending.append(args)
        if msg.get("role") == "tool" and msg.get("name") == "evaluate_offer":
            try:
                result = json.loads(msg.get("content") or "{}")
            except json.JSONDecodeError:
                result = {}
            args = pending.pop(0) if pending else {}
            offer = _coerce_float(args.get("carrier_offer"))
            rounds.append({
                "load_id": str(args.get("load_id") or ""),
                "round_number": int(args.get("round_number") or len(rounds) + 1),
                "carrier_offer": offer,
                "last_broker_offer": _coerce_float(args.get("last_broker_offer")),
                "decision": str(result.get("decision") or ""),
                "broker_counter": _coerce_float(result.get("broker_counter")),
            })
    return rounds


def _coerce_float(raw: Any) -> float:
    if raw is None or raw == "":
        return 0.0
    if isinstance(raw, (int, float)):
        return float(raw)
    text = str(raw).strip().replace(",", "").replace("$", "")
    try:
        return float(text)
    except ValueError:
        return 0.0


def _pick_load(loads: list[dict[str, Any]], load_id: str) -> dict[str, Any]:
    if load_id:
        for load in loads:
            if str(load.get("load_id") or "") == load_id:
                return load
    return loads[0] if loads else {}


def _infer_sentiment(messages: list[dict[str, Any]], classify: dict[str, Any]) -> str:
    reasoning = str(classify.get("reasoning") or "")
    if "positive" in reasoning.lower():
        return "positive"
    if "negative" in reasoning.lower():
        return "negative"
    text = _transcript_text(messages).lower()
    if any(w in text for w in ("thanks", "perfect", "great", "sounds good", "appreciate")):
        return "positive"
    if any(w in text for w in ("forget it", "too low", "not interested", "pass")):
        return "negative"
    return "neutral"


def _infer_outcome(
    *,
    fmcsa: dict[str, Any],
    rounds: list[dict[str, Any]],
    transferred: bool,
    classify: dict[str, Any],
    agreed_rate: float,
) -> str:
    if fmcsa and fmcsa.get("eligible") is False:
        return "carrier_ineligible"
    if transferred and agreed_rate > 0:
        return "load_booked"
    if rounds:
        last = rounds[-1]
        if last.get("decision") == "accept" and agreed_rate > 0:
            return "load_booked"
        if last.get("decision") == "reject":
            return "price_rejected"
    raw = classify.get("classification") or classify.get("outcome") or "other"
    return normalize_outcome(
        raw,
        agreed_rate=agreed_rate,
        carrier_eligible=bool(fmcsa.get("eligible", True)),
    )


async def reconstruct_run_payload(run_id: str) -> dict[str, Any] | None:
    """Build a webhook-equivalent payload from HappyRobot run node outputs."""
    nodes = await list_run_nodes(run_id)
    if not nodes:
        return None

    by_name: dict[str, list[dict[str, Any]]] = {}
    for node in nodes:
        if node.get("status") != "succeeded" or not node.get("output_id"):
            continue
        name = str(node.get("name") or "")
        output = await get_run_output(run_id, node["output_id"])
        by_name.setdefault(name, []).append(_node_data(output))

    voice = (by_name.get(_NODE_VOICE) or [{}])[0]
    messages = _parse_transcript_messages(voice.get("transcript"))
    fmcsa = (by_name.get(_NODE_FMCSA) or [{}])[0]
    if not fmcsa or fmcsa.get("eligible") is None and not fmcsa.get("mc_number"):
        fmcsa = _fmcsa_from_transcript(messages) or fmcsa
    search_batches = by_name.get(_NODE_SEARCH) or []
    loads: list[dict[str, Any]] = []
    for batch in search_batches:
        data = batch.get("data")
        if isinstance(data, list):
            loads.extend(data)

    eval_results = by_name.get(_NODE_EVALUATE) or []
    classify = (by_name.get(_NODE_CLASSIFY) or [{}])[0]
    if isinstance(classify.get("response"), dict):
        classify = classify["response"]

    rounds = _evaluate_rounds(messages)
    if rounds and eval_results and len(rounds) != len(eval_results):
        for i, api in enumerate(eval_results):
            if i < len(rounds):
                rounds[i]["decision"] = rounds[i].get("decision") or str(api.get("decision") or "")
                rounds[i]["broker_counter"] = rounds[i].get("broker_counter") or _coerce_float(api.get("broker_counter"))

    negotiated_load_id = ""
    if rounds:
        negotiated_load_id = rounds[-1].get("load_id") or rounds[0].get("load_id") or ""
    load = _pick_load(loads, negotiated_load_id)

    counter_offers = [r["carrier_offer"] for r in rounds if r.get("carrier_offer", 0) > 0]
    agreed_rate = 0.0
    if rounds and rounds[-1].get("decision") == "accept":
        agreed_rate = rounds[-1].get("carrier_offer", 0)

    transferred = _had_transfer(messages, by_name)
    duration = _coerce_float(voice.get("duration"))
    if not duration:
        sessions = await list_run_sessions(run_id)
        if sessions:
            duration = _coerce_float(sessions[0].get("duration"))

    mc = str(fmcsa.get("mc_number") or "")
    if not mc:
        mc = _mc_from_transcript(messages)
    carrier_name = str(fmcsa.get("carrier_name") or "").strip()
    if not carrier_name:
        carrier_name = _carrier_name_from_transcript(messages)
    carrier_name = _clean_name(carrier_name)

    sentiment = _infer_sentiment(messages, classify)
    outcome = _infer_outcome(
        fmcsa=fmcsa,
        rounds=rounds,
        transferred=transferred,
        classify=classify,
        agreed_rate=agreed_rate,
    )
    loadboard_rate = _coerce_float(load.get("loadboard_rate"))
    if agreed_rate <= 0 and outcome == "load_booked" and loadboard_rate > 0:
        # If the carrier accepts the posted rate without a counter, treat the
        # booked rate as the posted rate so dashboard KPIs reflect the booking.
        agreed_rate = loadboard_rate

    payload = {
        "run_id": run_id,
        "mc_number": mc,
        "carrier_name": carrier_name or ("Unknown caller" if messages else ""),
        "carrier_eligible": bool(fmcsa.get("eligible", False)) if fmcsa else False,
        "load_id": str(load.get("load_id") or negotiated_load_id or ""),
        "loadboard_rate": loadboard_rate,
        "agreed_rate": agreed_rate,
        "counter_offers": counter_offers,
        "origin": str(load.get("origin") or ""),
        "destination": str(load.get("destination") or ""),
        "equipment_type": str(load.get("equipment_type") or ""),
        "outcome": outcome,
        "sentiment": sentiment,
        "classification_reasoning": str(classify.get("reasoning") or ""),
        "duration_seconds": 0,
        "call_duration_seconds": duration,
        "transcript": _transcript_text(messages),
        "raw_payload": {
            "source": "run_reconstruction",
            "fmcsa": fmcsa,
            "rounds": rounds,
            "transferred": transferred,
        },
    }
    return payload


def payload_to_record_fields(payload: dict[str, Any]) -> dict[str, Any]:
    cleaned = normalize_call_fields(payload)
    return {
        **cleaned,
        "outcome": normalize_outcome(
            payload.get("outcome"),
            agreed_rate=cleaned["agreed_rate"],
            carrier_eligible=cleaned["carrier_eligible"],
        ),
        "sentiment": normalize_sentiment(payload.get("sentiment")),
        "classification_reasoning": str(payload.get("classification_reasoning") or ""),
        "transcript": str(payload.get("transcript") or ""),
        "run_id": str(payload.get("run_id") or ""),
        "raw_payload": payload.get("raw_payload") or payload,
    }


def is_sparse_record(row) -> bool:
    """True when DB row was synced from empty telemetry, not real call data."""
    if not row.run_id:
        return False
    if row.carrier_name in ("", "HappyRobot run"):
        return True
    if not row.mc_number and row.outcome in ("carrier_ineligible", "other", "platform_run"):
        return True
    if row.loadboard_rate <= 0 and row.agreed_rate <= 0 and row.outcome == "carrier_ineligible":
        return True
    return False
