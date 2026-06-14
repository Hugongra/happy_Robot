"""Modelos Pydantic para entradas y salidas de las tools MCP."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ApiErrorResponse(BaseModel):
    error: bool = True
    message: str
    hint: str | None = None
    retry_after_seconds: int | None = None


class RateLimitResponse(BaseModel):
    error: bool = True
    message: str


class LoadItem(BaseModel):
    load_id: str | None = None
    origin: str | None = None
    destination: str | None = None
    lane: str = ""
    equipment: str | None = None
    equipment_type: str | None = None
    loadboard_rate: float | None = None
    miles: float | None = None
    pickup_datetime: str | None = None

    model_config = {"extra": "ignore"}


class SearchLoadsResponse(BaseModel):
    loads: list[LoadItem]
    count: int
    limit: int
    x_cache: str = "MISS"


class MetricsSummaryResponse(BaseModel):
    window_days: int
    total_calls: int | None = None
    booked_loads: int | None = None
    booking_rate: float | None = None
    avg_agreed_rate: float | None = None
    avg_loadboard_rate: float | None = None
    rate_delta_pct: float | None = None
    avg_negotiation_rounds: float | None = None
    avg_call_seconds: float | None = None
    fmcsa_rejection_rate: float | None = None
    total_broker_margin: float | None = None
    x_cache: str = "MISS"

    model_config = {"extra": "ignore"}


class CallRow(BaseModel):
    call_id: int | None = None
    timestamp: str | None = None
    created_at: str | None = None
    mc: str = ""
    carrier: str = ""
    lane: str = ""
    equipment: str = ""
    posted: float | None = None
    loadboard_rate: float | None = None
    agreed: float | None = None
    agreed_rate: float | None = None
    margin: float | None = None
    rounds: int | None = None
    num_counter_offers: int | None = None
    outcome: str | None = None
    sentiment: str | None = None

    model_config = {"extra": "ignore"}


class RecentCallsResponse(BaseModel):
    calls: list[CallRow]
    count: int
    total_count: int
    offset: int
    limit: int
    has_more: bool
    x_cache: str = "MISS"


class CallDetailResponse(BaseModel):
    detail: dict[str, Any]
    x_cache: str = "MISS"


class SearchLoadsInput(BaseModel):
    origin: str | None = None
    destination: str | None = None
    equipment_type: str | None = None
    limit: int = Field(default=10, ge=1, le=10)


class RecentCallsInput(BaseModel):
    limit: int = Field(default=15, ge=1, le=50)
    offset: int = Field(default=0, ge=0)
    outcome: str | None = None
    hide_test_calls: bool = True
