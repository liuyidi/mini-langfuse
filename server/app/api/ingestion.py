"""POST /api/public/ingestion"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..schemas.ingestion import IngestionRequest, IngestionResponse
from ..services.ingestion import process_batch

router = APIRouter(prefix="/api/public", tags=["ingestion"])


@router.post("/ingestion", response_model=IngestionResponse)
def ingestion(
    payload: IngestionRequest,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> IngestionResponse:
    return process_batch(db, project_id, payload.batch)
