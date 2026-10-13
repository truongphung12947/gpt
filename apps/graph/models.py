"""Model catalogue: the models the LiteLLM proxy offers (optionally narrowed by LITELLM_MODELS)."""
import os
import time

import httpx

_TTL = 60
_cache: tuple[float, list[str]] = (0.0, [])


def default_model() -> str:
    return os.environ.get("LITELLM_MODEL") or "gpt-6-luna"


def available_models() -> list[str]:
    global _cache
    base_url = os.environ.get("LITELLM_BASE_URL")
    if not base_url:
        return [default_model()]
    now = time.monotonic()
    if _cache[1] and now - _cache[0] < _TTL:
        return _cache[1]
    try:
        r = httpx.get(
            base_url.rstrip("/") + "/v1/models",
            headers={"Authorization": f"Bearer {os.environ.get('LITELLM_API_KEY', '')}"},
            timeout=10,
        )
        r.raise_for_status()
        ids = sorted(m["id"] for m in r.json().get("data", []))
    except Exception:
        return _cache[1] or [default_model()]
    allow = {m.strip() for m in os.environ.get("LITELLM_MODELS", "").split(",") if m.strip()}
    if allow:
        ids = [m for m in ids if m in allow]
    _cache = (now, ids or [default_model()])
    return _cache[1]
