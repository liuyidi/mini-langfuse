"""LLM proxy for the Playground.

Three providers:
- mock (default): no API key, returns a deterministic fake response for demos
- openai: OpenAI-compatible Chat Completions (OPENAI / DeepSeek / etc.)
  Keys: MLF_OPENAI_API_KEY or OPENAI_API_KEY
  Base URL: MLF_OPENAI_BASE_URL or OPENAI_BASE_URL (default https://api.openai.com/v1)
- anthropic: MLF_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY

Each returns a normalized dict:
    {
      "content": str,
      "usage": {"prompt_tokens": int, "completion_tokens": int, "total_tokens": int},
      "latency_ms": float,
      "raw": {...},         # provider-specific response
    }
"""
from __future__ import annotations

import os
import time
from typing import Any

import httpx


class LLMError(Exception):
    pass


def _approx_tokens(text: str) -> int:
    """Very rough token count for the mock provider (1 token ~= 4 chars)."""
    return max(1, len(text) // 4)


def _mock(messages: list[dict], model: str, params: dict) -> dict[str, Any]:
    """Deterministic mock reply.

    Composes a short echo so the UI has something to display without a real API key.
    """
    t0 = time.perf_counter()
    time.sleep(0.05)  # simulate a small network delay
    # Extract last user message content for a plausible echo
    user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user" and isinstance(m.get("content"), str):
            user_msg = m["content"]
            break
    reply = f"[mock:{model}] Received {len(messages)} messages. Latest user said: {user_msg[:80]}"
    latency_ms = (time.perf_counter() - t0) * 1000.0
    prompt_tokens = sum(_approx_tokens(str(m.get("content", ""))) for m in messages)
    completion_tokens = _approx_tokens(reply)
    return {
        "content": reply,
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
        "latency_ms": latency_ms,
        "raw": {"provider": "mock", "model": model},
    }


def _openai(messages: list[dict], model: str, params: dict) -> dict[str, Any]:
    from ..config import settings

    api_key = (settings.openai_api_key or os.environ.get("OPENAI_API_KEY") or "").strip()
    if not api_key:
        raise LLMError(
            "OPENAI_API_KEY is not set on the server "
            "(set MLF_OPENAI_API_KEY or OPENAI_API_KEY in server/.env)"
        )
    base = (
        settings.openai_base_url
        or os.environ.get("OPENAI_BASE_URL")
        or "https://api.openai.com/v1"
    ).rstrip("/")
    body = {"model": model, "messages": messages, **params}
    t0 = time.perf_counter()
    with httpx.Client(timeout=60.0) as h:
        r = h.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json=body,
        )
    latency_ms = (time.perf_counter() - t0) * 1000.0
    if r.status_code >= 400:
        raise LLMError(f"OpenAI-compatible error {r.status_code}: {r.text[:500]}")
    data = r.json()
    choice = data["choices"][0]["message"]
    usage = data.get("usage", {}) or {}
    return {
        "content": choice.get("content", ""),
        "usage": {
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
            "total_tokens": usage.get("total_tokens"),
        },
        "latency_ms": latency_ms,
        "raw": data,
    }


def _anthropic(messages: list[dict], model: str, params: dict) -> dict[str, Any]:
    from ..config import settings

    api_key = (settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    if not api_key:
        raise LLMError(
            "ANTHROPIC_API_KEY is not set on the server "
            "(set MLF_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY in server/.env)"
        )

    # Anthropic requires system message split out from messages
    system_msg: str | None = None
    conv: list[dict] = []
    for m in messages:
        if m.get("role") == "system":
            system_msg = m.get("content") if isinstance(m.get("content"), str) else system_msg
        else:
            conv.append(m)

    body: dict[str, Any] = {
        "model": model,
        "messages": conv,
        "max_tokens": params.get("max_tokens", 1024),
    }
    if system_msg is not None:
        body["system"] = system_msg
    for k in ("temperature", "top_p", "top_k", "stop_sequences"):
        if k in params:
            body[k] = params[k]

    t0 = time.perf_counter()
    with httpx.Client(timeout=60.0) as h:
        r = h.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=body,
        )
    latency_ms = (time.perf_counter() - t0) * 1000.0
    if r.status_code >= 400:
        raise LLMError(f"Anthropic error {r.status_code}: {r.text[:500]}")
    data = r.json()
    parts = data.get("content") or []
    content = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
    usage = data.get("usage", {}) or {}
    prompt_tokens = usage.get("input_tokens")
    completion_tokens = usage.get("output_tokens")
    total = None
    if prompt_tokens is not None and completion_tokens is not None:
        total = prompt_tokens + completion_tokens
    return {
        "content": content,
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total,
        },
        "latency_ms": latency_ms,
        "raw": data,
    }


def call(provider: str, model: str, messages: list[dict], params: dict) -> dict[str, Any]:
    """Dispatch by provider name."""
    p = (provider or "mock").lower()
    if p == "mock":
        return _mock(messages, model, params)
    if p == "openai":
        return _openai(messages, model, params)
    if p == "anthropic":
        return _anthropic(messages, model, params)
    raise LLMError(f"Unknown provider: {provider}")
