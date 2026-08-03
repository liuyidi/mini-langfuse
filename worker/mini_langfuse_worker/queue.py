"""Queue backends for the worker."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol

from .schemas import IngestionJob, QueueEvent


class QueueBackend(Protocol):
    def ensure_ready(self) -> None: ...

    def fetch(self, batch_size: int, block_ms: int) -> list[IngestionJob]: ...

    def ack(self, job: IngestionJob) -> None: ...

    def nack(self, job: IngestionJob, reason: str) -> None: ...


@dataclass(slots=True)
class DryRunQueue:
    """A no-op backend so the worker can start without Redis."""

    def ensure_ready(self) -> None:
        return None

    def fetch(self, batch_size: int, block_ms: int) -> list[IngestionJob]:
        return []

    def ack(self, job: IngestionJob) -> None:
        return None

    def nack(self, job: IngestionJob, reason: str) -> None:
        return None


class RedisStreamQueue:
    """Redis Streams consumer group backend."""

    def __init__(self, redis_url: str, stream: str, group: str, consumer: str) -> None:
        try:
            import redis
        except ImportError as exc:  # pragma: no cover - dependency optional in repo checkout
            raise RuntimeError(
                "Redis mode requires the `redis` package. Install it before running the worker."
            ) from exc

        self._redis = redis.Redis.from_url(redis_url, decode_responses=True)
        self.stream = stream
        self.group = group
        self.consumer = consumer

    def ensure_ready(self) -> None:
        try:
            self._redis.xgroup_create(self.stream, self.group, id="0-0", mkstream=True)
        except Exception as exc:  # noqa: BLE001
            if "BUSYGROUP" not in str(exc):
                raise

    def fetch(self, batch_size: int, block_ms: int) -> list[IngestionJob]:
        result = self._redis.xreadgroup(
            groupname=self.group,
            consumername=self.consumer,
            streams={self.stream: ">"},
            count=batch_size,
            block=block_ms,
        )
        jobs: list[IngestionJob] = []
        for _, messages in result:
            for message_id, fields in messages:
                jobs.append(_job_from_message(message_id, fields))
        return jobs

    def ack(self, job: IngestionJob) -> None:
        self._redis.xack(self.stream, self.group, job.job_id)

    def nack(self, job: IngestionJob, reason: str) -> None:
        self._redis.xadd(
            f"{self.stream}:dlq",
            {"job_id": job.job_id, "project_id": job.project_id, "reason": reason},
        )
        self._redis.xack(self.stream, self.group, job.job_id)


def _job_from_message(message_id: str, fields: dict[str, Any]) -> IngestionJob:
    events_raw = json.loads(fields.get("event_batch") or fields.get("events") or "[]")
    events = [
        QueueEvent(
            id=str(item["id"]),
            type=item["type"],
            body=item.get("body", {}),
        )
        for item in events_raw
    ]
    return IngestionJob(
        job_id=message_id,
        project_id=str(fields.get("project_id", "")),
        received_at=_parse_iso(fields.get("received_at")),
        attempt=int(fields.get("attempt", "1")),
        events=events,
    )


def _parse_iso(value: Any):
    from datetime import datetime, timezone

    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        return datetime.fromisoformat(value)
    return datetime.now(timezone.utc)
