"""Idempotency-Key support for state-changing endpoints.

Per master spec §7.3: 24-hour dedupe window keyed on
(Idempotency-Key, user_id, endpoint). On repeat within 24h, return the
original response without re-executing the side effect.

Stored in Redis when REDIS_URL is available, in the DB otherwise.
"""
from __future__ import annotations

import hashlib
import json
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response


IDEMPOTENCY_TTL = 60 * 60 * 24  # 24h
HEADER = "Idempotency-Key"


def _key(user_id: int, endpoint: str, raw_key: str) -> str:
    digest = hashlib.sha256(f"{user_id}|{endpoint}|{raw_key}".encode()).hexdigest()
    return f"idemp:{endpoint}:{digest}"


def with_idempotency(view_func):
    """Decorator: if Idempotency-Key header is present, dedupe.

    Works for both function-based views (request, *args, **kwargs)
    and method-based DRF views (self, request, *args, **kwargs).
    """

    def wrapper(*args, **kwargs):
        # First positional arg is `self` for DRF methods, `request` for FBVs.
        request = args[1] if len(args) >= 2 and hasattr(args[0], "META") is False and hasattr(args[1], "META") else args[0]
        raw_key = request.headers.get(HEADER, "").strip()
        if not raw_key:
            return view_func(*args, **kwargs)

        endpoint = request.path
        cache_key = _key(request.user.id, endpoint, raw_key)
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(json.loads(cached), status=status.HTTP_200_OK)

        response = view_func(*args, **kwargs)
        if 200 <= response.status_code < 300:
            try:
                cache.set(
                    cache_key,
                    json.dumps(response.data, default=str),
                    IDEMPOTENCY_TTL,
                )
            except (TypeError, ValueError):
                pass
        return response

    wrapper.__name__ = view_func.__name__
    return wrapper
