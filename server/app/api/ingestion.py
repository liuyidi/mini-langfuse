"""POST /api/public/ingestion"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from ..auth import require_project
from ..config import settings
from ..db import get_db
from ..schemas.ingestion import IngestionRequest, IngestionResponse
from ..services.ingestion_queue import enqueue_ingestion_job, get_queue_status
from ..services.ingestion import process_batch

router = APIRouter(prefix="/api/public", tags=["ingestion"])


@router.post("/ingestion", response_model=IngestionResponse)
def ingestion(
    payload: IngestionRequest,
    response: Response,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> IngestionResponse:
    if settings.ingestion_queue_url:
        job = enqueue_ingestion_job(
            redis_url=settings.ingestion_queue_url,
            stream_name=settings.ingestion_queue_stream,
            project_id=project_id,
            events=payload.batch,
            maxlen=settings.ingestion_queue_maxlen,
        )
        response.status_code = status.HTTP_202_ACCEPTED
        response.headers["X-Ingestion-Job-Id"] = job["job_id"]
        response.headers["X-Ingestion-Queued"] = "true"
        return IngestionResponse(successes=[], errors=[])

    return process_batch(db, project_id, payload.batch)


@router.get("/ingestion/queue-status")
def ingestion_queue_status(
    project_id: str = Depends(require_project),
):
    """Basic queue status for the current project context."""
    if not settings.ingestion_queue_url:
        return {"enabled": False, "project_id": project_id}

    return {
        "enabled": True,
        "project_id": project_id,
        **get_queue_status(
            redis_url=settings.ingestion_queue_url,
            stream_name=settings.ingestion_queue_stream,
            group_name=settings.ingestion_queue_group,
        ),
    }
