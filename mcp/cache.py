"""Cache in-memory con TTL para respuestas cacheables."""

from __future__ import annotations

from cachetools import TTLCache

from config import get_settings

_caches: dict[int, TTLCache] = {}


def _cache(ttl: int | None = None) -> TTLCache:
    ttl = ttl if ttl is not None else get_settings().metrics_cache_ttl_seconds
    if ttl not in _caches:
        _caches[ttl] = TTLCache(maxsize=64, ttl=ttl)
    return _caches[ttl]


def cache_get(key: str, *, ttl: int | None = None) -> object | None:
    return _cache(ttl).get(key)


def cache_set(key: str, value: object, *, ttl: int | None = None) -> None:
    _cache(ttl)[key] = value


def cache_clear() -> None:
    _caches.clear()
