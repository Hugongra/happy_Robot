"""Rate limiting por sesión MCP (ventana deslizante 1 minuto)."""

from __future__ import annotations

import math
import time
from collections import deque

from config import get_settings


class RateLimiter:
    def __init__(self, max_per_minute: int | None = None) -> None:
        self._max = max_per_minute or get_settings().mcp_rate_limit_per_min
        self._timestamps: deque[float] = deque()

    @property
    def limit(self) -> int:
        return self._max

    def check(self) -> tuple[bool, int]:
        """Devuelve (permitido, segundos_hasta_reintentar)."""
        now = time.monotonic()
        cutoff = now - 60.0
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()
        if len(self._timestamps) >= self._max:
            retry = max(1, int(math.ceil(60.0 - (now - self._timestamps[0]))))
            return False, retry
        self._timestamps.append(now)
        return True, 0

    def reset(self) -> None:
        self._timestamps.clear()


_limiter = RateLimiter()


def get_rate_limiter() -> RateLimiter:
    return _limiter
