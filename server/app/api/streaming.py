"""Streaming API - Server-Sent Events for real-time updates (M10)."""
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from ..db import SessionLocal
from ..services.auth import validate_session
from ..services.event_bus import bus
from .api_keys import _require_project_access

router = APIRouter(prefix="/api/ui", tags=["streaming"])


@router.get("/stream")
async def stream_events(
    project_id: Optional[str] = Query(default=None),
    mlf_session: Optional[str] = Cookie(None),
):
    """SSE endpoint for real-time event streaming.

    Auth: session cookie (same as other /api/ui/* routes). EventSource cannot
    send Authorization headers, so Basic/API-key auth is intentionally not used.

    Important: do **not** use ``Depends(get_db)`` / ``get_current_user`` here.
    Those keep a SQLAlchemy session open until the response finishes; an SSE
    stream can last hours and would exhaust the connection pool (idle in
    transaction). Authz uses a short-lived session that is closed before the
    stream starts.

    Clients connect with EventSource and receive events like:
    - trace_upserted: when a trace is created or updated
    - score_created: when a new score is added

    Events are JSON-encoded in the `data` field.
    """
    if not project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id query parameter is required",
        )
    if mlf_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    db = SessionLocal()
    try:
        user = validate_session(db, mlf_session)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired session",
            )
        _require_project_access(db, user.id, project_id, min_role="VIEWER")
    finally:
        db.close()

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
