"""Model catalogue: the models the LiteLLM proxy offers (optionally narrowed by LITELLM_MODELS)."""
import os
import time
from typing import TypedDict

import httpx

_TTL = 60
_cache: tuple[float, list["ModelInfo"]] = (0.0, [])


class ModelInfo(TypedDict):
    id: str
    context_window: int | None
    supports_reasoning: bool


def default_model() -> str:
    return os.environ.get("LITELLM_MODEL") or "gpt-6-luna"


def _fetch(base_url: str) -> list[ModelInfo]:
    headers = {"Authorization": f"Bearer {os.environ.get('LITELLM_API_KEY', '')}"}
    base = base_url.rstrip("/")
    try:  # rich metadata (context window, reasoning support)
        r = httpx.get(base + "/model/info", headers=headers, timeout=10)
        r.raise_for_status()
        found: dict[str, ModelInfo] = {}
        for m in r.json().get("data", []):
            info = m.get("model_info") or {}
            found[m["model_name"]] = {
                "id": m["model_name"],
                "context_window": info.get("max_input_tokens") or info.get("max_tokens"),
                "supports_reasoning": bool(info.get("supports_reasoning")),
            }
        if found:
            return sorted(found.values(), key=lambda m: m["id"])
    except Exception:
        pass
    r = httpx.get(base + "/v1/models", headers=headers, timeout=10)  # ids only
    r.raise_for_status()
    return [
        {"id": m["id"], "context_window": None, "supports_reasoning": False}
        for m in sorted(r.json().get("data", []), key=lambda m: m["id"])
    ]


def available_models() -> list[ModelInfo]:
    global _cache
    base_url = os.environ.get("LITELLM_BASE_URL")
    if not base_url:
        return [{"id": default_model(), "context_window": None, "supports_reasoning": False}]
    now = time.monotonic()
    if _cache[1] and now - _cache[0] < _TTL:
        return _cache[1]
    try:
        models = _fetch(base_url)
    except Exception:
        return _cache[1] or [
            {"id": default_model(), "context_window": None, "supports_reasoning": False}
        ]
    allow = {m.strip() for m in os.environ.get("LITELLM_MODELS", "").split(",") if m.strip()}
    if allow:
        models = [m for m in models if m["id"] in allow]
    _cache = (now, models or [{"id": default_model(), "context_window": None, "supports_reasoning": False}])
    return _cache[1]


def find_model(model_id: str | None) -> ModelInfo | None:
    return next((m for m in available_models() if m["id"] == model_id), None)
