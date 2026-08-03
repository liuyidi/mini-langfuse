"""Lightweight worker payload schemas."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal


EventType = Literal[
    "trace-create",
    "span-create",
    "span-update",
    "generation-create",
    "generation-update",
    "event-create",
]


@dataclass(slots=True)
class QueueEvent:
    id: str
    type: EventType
    body: dict[str, Any]
    timestamp: datetime | None = None


@dataclass(slots=True)
class IngestionJob:
    job_id: str
    project_id: str
    received_at: datetime
    attempt: int
    events: list[QueueEvent]

