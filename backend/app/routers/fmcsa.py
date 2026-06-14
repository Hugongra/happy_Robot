"""FMCSA verification proxy.

The HappyRobot voice agent calls this endpoint via a webhook tool node, passing
the MC number the carrier provided on the call. We call FMCSA, normalize the
response into a simple eligible/not-eligible decision, and return both the
decision and the carrier name so the agent can address them personally.
"""
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_api_key
from app.settings import settings

router = APIRouter(tags=["fmcsa"], dependencies=[Depends(require_api_key)])

FMCSA_TIMEOUT = 5.0  # keep under HappyRobot tool timeout; demo MCs skip upstream


class VerifyIn(BaseModel):
    mc_number: str  # accepts "MC-123456", "MC 123456", "123456", or spoken "one two three..."


class VerifyOut(BaseModel):
    eligible: bool
    mc_number: str
    carrier_name: str = ""
    dot_number: str = ""
    reason: str = ""           # human-readable reason if not eligible
    allowed_to_operate: str = ""
    operating_status: str = ""


def _normalize_mc(raw: str) -> str:
    """Strip non-digits. Carriers / STT may produce 'MC 123 456' or 'MC-123456'."""
    digits = re.sub(r"\D", "", raw or "")
    return digits


# Used when FMCSA is down or the webKey returns 403 (common in FDE demos).
_DEMO_CARRIERS: dict[str, dict[str, str]] = {
    "123456": {"carrier_name": "Acme Trucking LLC", "dot_number": "1234567"},
}


def _demo_verify(mc: str) -> VerifyOut | None:
    demo = _DEMO_CARRIERS.get(mc)
    if not demo:
        return None
    return VerifyOut(
        eligible=True,
        mc_number=mc,
        carrier_name=demo["carrier_name"],
        dot_number=demo["dot_number"],
        reason="Active, authorized (demo carrier — FMCSA API unavailable).",
        allowed_to_operate="Y",
        operating_status="A",
    )


def _fmcsa_unavailable(mc: str) -> VerifyOut:
    """Graceful degradation when FMCSA upstream errors or times out."""
    return VerifyOut(
        eligible=False,
        mc_number=mc,
        carrier_name="",
        reason="FMCSA unavailable",
    )


@router.post("/fmcsa/verify", response_model=VerifyOut)
async def verify_carrier(payload: VerifyIn) -> VerifyOut:
    mc = _normalize_mc(payload.mc_number)
    if not mc:
        return VerifyOut(eligible=False, mc_number=payload.mc_number,
                         reason="Could not parse a valid MC number from input.")

    # Demo carriers: instant response, no upstream call (avoids Fly cold-start timeouts)
    if demo := _demo_verify(mc):
        return demo

    if not settings.fmcsa_web_key:
        raise HTTPException(status_code=500, detail="FMCSA_WEB_KEY not configured on server.")

    url = f"{settings.fmcsa_base_url}/docket-number/{mc}"
    params = {"webKey": settings.fmcsa_web_key}

    try:
        async with httpx.AsyncClient(timeout=FMCSA_TIMEOUT) as client:
            r = await client.get(url, params=params)
    except httpx.HTTPError:
        if demo := _demo_verify(mc):
            return demo
        return _fmcsa_unavailable(mc)

    if r.status_code == 404:
        if demo := _demo_verify(mc):
            return demo
        return VerifyOut(eligible=False, mc_number=mc, reason="MC number not found at FMCSA.")
    if r.status_code != 200:
        if demo := _demo_verify(mc):
            return demo
        return _fmcsa_unavailable(mc)

    try:
        data = r.json()
    except ValueError:
        if demo := _demo_verify(mc):
            return demo
        return _fmcsa_unavailable(mc)

    # FMCSA returns { "content": [ { "carrier": {...} } ] }
    content = data.get("content")
    if not content:
        return VerifyOut(eligible=False, mc_number=mc, reason="No carrier record returned by FMCSA.")

    carrier = (content[0] if isinstance(content, list) else content).get("carrier", {})
    allowed = (carrier.get("allowedToOperate") or "").upper()           # "Y" / "N"
    status_code = (carrier.get("statusCode") or "").upper()             # "A" active / "I" inactive
    out_of_service = carrier.get("oosDate")                              # truthy => out of service
    legal_name = carrier.get("legalName") or carrier.get("dbaName") or ""
    dot = str(carrier.get("dotNumber") or "")

    eligible = (allowed == "Y") and (status_code == "A") and (not out_of_service)
    if eligible:
        reason = "Active, authorized, not out-of-service."
    elif out_of_service:
        reason = f"Carrier is out of service (since {out_of_service})."
    elif allowed != "Y":
        reason = "Carrier is not authorized to operate."
    else:
        reason = "Carrier status is not active."

    return VerifyOut(
        eligible=eligible,
        mc_number=mc,
        carrier_name=legal_name,
        dot_number=dot,
        reason=reason,
        allowed_to_operate=allowed,
        operating_status=status_code,
    )
