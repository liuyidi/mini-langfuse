"""Streaming API - Server-Sent Events for real-time updates (M10)."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..services.event_bus import bus

router = APIRouter(prefix="/api/ui", tags=["streaming"])


@router.get("/stream")
async def stream_events(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """SSE endpoint for real-time event streaming.

    Clients connect with EventSource and receive events like:
    - trace_upserted: when a trace is created or updated
    - score_created: when a new score is added

    Events are JSON-encoded in the `data` field.
    """

    async def event_generator():
        # Send initial connection event
        yield f"data: {json.dumps({'type': 'connected', 'project_id': project_id})}\n\n"

        # Subscribe to events for this project
        async for event in bus.subscribe(project_id):
            data = json.dumps({
                "type": event.type,
                "payload": event.payload,
            })
            yield f"data: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
