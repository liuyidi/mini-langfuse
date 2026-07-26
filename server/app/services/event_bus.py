"""In-memory event bus for real-time pub/sub (M10).

Publishes events when traces are ingested, allowing SSE subscribers
to receive real-time updates.

Note: This is a single-process event bus. For multi-worker/multi-node
deployments, replace with Redis pub/sub or Postgres LISTEN/NOTIFY.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass
from typing import AsyncGenerator


@dataclass
class Event:
    """An event published to the bus."""
    type: str  # e.g. "trace_upserted", "score_created"
    project_id: str
    payload: dict


class EventBus:
    """Simple in-memory pub/sub event bus."""

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[Event]]] = defaultdict(list)

    def publish(self, project_id: str, event_type: str, payload: dict | None = None) -> None:
        """Publish an event to all subscribers of a project.

        Non-blocking: drops the event if a subscriber's queue is full.
        """
        event = Event(type=event_type, project_id=project_id, payload=payload or {})
        for q in self._subscribers.get(project_id, []):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                # Subscriber is too slow, skip this event
                pass

    async def subscribe(self, project_id: str) -> AsyncGenerator[Event, None]:
        """Subscribe to events for a project. Yields events as they arrive."""
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=1000)
        self._subscribers[project_id].append(q)
        try:
            while True:
                event = await q.get()
                yield event
        finally:
            self._subscribers[project_id].remove(q)

    def subscriber_count(self, project_id: str) -> int:
        """Return number of active subscribers for a project."""
        return len(self._subscribers.get(project_id, []))


# Global singleton instance
bus = EventBus()
