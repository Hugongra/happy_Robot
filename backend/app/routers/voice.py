"""Voice token endpoint.

The browser hits this to get a short-lived LiveKit token for a web call.
We never expose the HappyRobot API key to the client.
"""
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.settings import settings

router = APIRouter(tags=["voice"])


class TokenOut(BaseModel):
    url: str
    token: str
    room_name: str
    run_id: str


@router.post("/voice/token", response_model=TokenOut)
async def create_voice_token() -> TokenOut:
    """No API key required on this endpoint — it's called from the browser.

    In production, gate this with a session cookie or an Origin allowlist.
    For the demo we rely on CORS + the fact that the HappyRobot side enforces
    its own workflow-id allowlist.
    """
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
