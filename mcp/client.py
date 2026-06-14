"""Cliente HTTP async hacia la Carrier Sales API (retries, cache, timeouts)."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from cache import cache_get, cache_set
from config import Settings, get_settings
from models import ApiErrorResponse

logger = logging.getLogger(__name__)

CONNECT_TIMEOUT = 10.0
READ_TIMEOUT = 30.0
MAX_RETRIES = 3
API_LOADS_LIMIT = 10
API_RECENT_CALLS_LIMIT = 200


class RetryableHTTPError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        super().__init__(message)


class CarrierAPIClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._timeout = httpx.Timeout(
            connect=CONNECT_TIMEOUT,
            read=READ_TIMEOUT,
            write=READ_TIMEOUT,
            pool=CONNECT_TIMEOUT,
        )

    @property
    def base_url(self) -> str:
        return self._settings.base_url

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Accept": "application/json"}
        if self._settings.carrier_api_key:
            headers["X-API-Key"] = self._settings.carrier_api_key
        return headers

    @staticmethod
    def _should_retry_status(status_code: int) -> bool:
        return status_code == 429 or status_code >= 500

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
    ) -> Any:
        url = f"{self.base_url}{path}"

        @retry(
            stop=stop_after_attempt(MAX_RETRIES),
            wait=wait_exponential(multiplier=0.5, min=0.5, max=8),
            retry=retry_if_exception_type(RetryableHTTPError),
            reraise=True,
        )
        async def _do_request() -> Any:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.request(
                    method,
                    url,
                    params=params,
                    headers=self._headers(),
                )
                if self._should_retry_status(response.status_code):
                    raise RetryableHTTPError(
                        response.status_code,
                        f"HTTP {response.status_code} from {path}",
                    )
                if response.status_code >= 400:
                    detail = response.text[:500]
                    raise httpx.HTTPStatusError(
                        f"HTTP {response.status_code}",
                        request=response.request,
                        response=response,
                    )
                return response.json()

        try:
            return await _do_request()
        except RetryableHTTPError as exc:
            logger.warning(
                "API retry exhausted path=%s status=%s attempts=%s",
                path,
                exc.status_code,
                MAX_RETRIES,
            )
            return ApiErrorResponse(
                message=(
                    "La API no responde después de 3 intentos. "
                    "Puede estar temporalmente caída."
                ),
                retry_after_seconds=60,
            ).model_dump()
        except httpx.TimeoutException:
            logger.warning("API timeout path=%s", path)
            return ApiErrorResponse(
                message=(
                    "La API tardó demasiado en responder. "
                    "Comprueba que el backend está en marcha."
                ),
                hint=f"URL configurada: {self.base_url}",
            ).model_dump()
        except httpx.ConnectError:
            logger.warning("API connection error path=%s base=%s", path, self.base_url)
            return ApiErrorResponse(
                message="No se pudo conectar con la API del carrier sales agent.",
                hint=f"URL configurada: {self.base_url}",
            ).model_dump()
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response else "?"
            detail = exc.response.text[:500] if exc.response else str(exc)
            logger.warning("API HTTP error path=%s status=%s", path, status)
            return ApiErrorResponse(
                message=f"La API respondió con error HTTP {status}.",
                hint=detail,
            ).model_dump()
        except Exception as exc:
            logger.exception("Unexpected API error path=%s", path)
            return ApiErrorResponse(
                message="Error inesperado al consultar la API.",
                hint=str(exc),
            ).model_dump()

    async def get_json(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        *,
        cache_key: str | None = None,
    ) -> tuple[Any, str]:
        """Devuelve (payload, x_cache) donde x_cache es HIT o MISS."""
        if cache_key:
            cached = cache_get(cache_key)
            if cached is not None:
                return cached, "HIT"

        data = await self._request("GET", path, params=params)
        if isinstance(data, dict) and data.get("error"):
            return data, "MISS"

        if cache_key:
            cache_set(cache_key, data)
        return data, "MISS"

    async def search_loads(
        self,
        *,
        origin: str | None = None,
        destination: str | None = None,
        equipment_type: str | None = None,
        limit: int = 10,
    ) -> tuple[Any, str]:
        params: dict[str, Any] = {"limit": API_LOADS_LIMIT}
        if origin:
            params["origin"] = origin
        if destination:
            params["destination"] = destination
        if equipment_type:
            params["equipment_type"] = equipment_type

        data, x_cache = await self.get_json("/api/loads/search", params)
        if isinstance(data, dict) and data.get("error"):
            return data, x_cache

        rows = data if isinstance(data, list) else data.get("loads", data)
        if not isinstance(rows, list):
            rows = []

        capped_limit = max(1, min(API_LOADS_LIMIT, limit))
        return {"loads": rows[:capped_limit], "limit": capped_limit}, x_cache

    async def get_metrics_summary(self, *, window_days: int = 7) -> tuple[Any, str]:
        cache_key = f"metrics_summary:{window_days}"
        return await self.get_json(
            "/api/metrics/summary",
            {"days": window_days},
            cache_key=cache_key,
        )

    async def get_recent_calls(
        self,
        *,
        limit: int = 15,
        offset: int = 0,
        outcome: str | None = None,
        hide_test_calls: bool = True,
    ) -> tuple[Any, str]:
        params: dict[str, Any] = {"limit": API_RECENT_CALLS_LIMIT}

        data, x_cache = await self.get_json("/api/metrics/recent-calls", params)
        if isinstance(data, dict) and data.get("error"):
            return data, x_cache

        rows = data if isinstance(data, list) else data.get("calls", [])
        if not isinstance(rows, list):
            rows = []

        if hide_test_calls:
            rows = [
                r
                for r in rows
                if not (
                    (r.get("outcome") or "").lower() == "platform_run"
                    and not (r.get("mc") or "").strip()
                )
            ]

        if outcome:
            rows = [
                r
                for r in rows
                if (r.get("outcome") or "").lower() == outcome.lower()
            ]

        total_count = len(rows)
        page = rows[offset : offset + limit]
        return {
            "calls": page,
            "total_count": total_count,
            "offset": offset,
            "limit": limit,
            "has_more": offset + limit < total_count,
        }, x_cache

    async def get_call_detail(self, call_id: int) -> tuple[Any, str]:
        return await self.get_json(f"/api/metrics/calls/{call_id}")


_client: CarrierAPIClient | None = None


def get_client(settings: Settings | None = None) -> CarrierAPIClient:
    global _client
    if settings is not None:
        return CarrierAPIClient(settings)
    if _client is None:
        _client = CarrierAPIClient()
    return _client


def reset_client() -> None:
    global _client
    _client = None
