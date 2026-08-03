"""Redis-backed ingestion queue helpers."""
from __future__ import annotations

import json
import secrets
import time
from datetime import datetime, timezone
from typing import Any

from ..schemas.ingestion import IngestionEvent


def _new_job_id() -> str:
    return f"job_{int(time.time() * 1000):012x}{secrets.token_hex(6)}"


def build_ingestion_job(project_id: str, events: list[IngestionEvent]) -> dict[str, Any]:
    """Build the internal queue envelope sent to Redis."""
    return {
        "job_id": _new_job_id(),
        "project_id": project_id,
        "attempt": 1,
        "received_at": datetime.now(timezone.utc).isoformat(),
        "event_batch": json.dumps([evt.model_dump(mode="json") for evt in events], ensure_ascii=False),
    }


def enqueue_ingestion_job(
    redis_url: str,
    stream_name: str,
    project_id: str,
    events: list[IngestionEvent],
    maxlen: int,
) -> dict[str, Any]:
    """Enqueue an ingestion job into Redis Streams."""
    try:
        import redis
    except ImportError as exc:  # pragma: no cover - dependency missing in some local envs
        raise RuntimeError("Redis support is not installed") from exc

    client = redis.Redis.from_url(redis_url, decode_responses=True)
    job = build_ingestion_job(project_id, events)
    client.xadd(stream_name, job, maxlen=maxlen, approximate=True)
    return job


def get_queue_status(redis_url: str, stream_name: str, group_name: str) -> dict[str, Any]:
    """Return basic Redis Stream health information."""
    try:
        import redis
    except ImportError as exc:  # pragma: no cover - dependency missing in some local envs
        raise RuntimeError("Redis support is not installed") from exc

    client = redis.Redis.from_url(redis_url, decode_responses=True)
    stream_length = client.xlen(stream_name)
    pending_total = 0
    pending_info: dict[str, Any] | None = None
    try:
        pending_info = client.xpending(stream_name, group_name)
        pending_total = int(pending_info.get("pending", 0))
    except Exception:
        pending_info = None

    return {
        "enabled": True,
        "stream": stream_name,
        "group": group_name,
        "stream_length": int(stream_length),
        "pending": pending_total,
        "pending_info": pending_info,
    }
