"""Voice token endpoint.

The browser hits this to get a short-lived LiveKit token for a web call.
Requires X-API-Key (same as dashboard). HappyRobot credentials stay server-side.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import require_api_key
from app.settings import settings

router = APIRouter(tags=["voice"], dependencies=[Depends(require_api_key)])


class TokenOut(BaseModel):
    url: str
    token: str
    room_name: str
    run_id: str


@router.post("/voice/token", response_model=TokenOut)
async def create_voice_token() -> TokenOut:
    """Mint a LiveKit token via HappyRobot. Caller must send X-API-Key."""
    if not settings.happyrobot_api_key or not settings.happyrobot_workflow_id:
        raise HTTPException(500, "HappyRobot credentials not configured on server.")

    url = f"{settings.happyrobot_base_url}/voice/tokens"
    headers = {
        "Authorization": f"Bearer {settings.happyrobot_api_key}",
        "Content-Type": "application/json",
    }
    body = {"workflow_id": settings.happyrobot_workflow_id, "env": "production"}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.post(url, json=body, headers=headers)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"HappyRobot upstream error: {e}")

    if r.status_code != 200:
        raise HTTPException(r.status_code, f"HappyRobot error: {r.text}")

    data = r.json()
    return TokenOut(
        url=data["url"],
        token=data["token"],
        room_name=data.get("room_name", ""),
        run_id=data.get("run_id", ""),
    )
