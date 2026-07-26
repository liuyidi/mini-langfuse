"""Scores API - POST /scores, GET /scores?traceId=..."""
from __future__ import annotations

import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..models import Score, Trace
from ..schemas.score import ScoreCreate, ScoreListResponse, ScoreOut, ScoreUpdate

router = APIRouter(prefix="/api/public/scores", tags=["scores"])


def _new_id(prefix: str) -> str:
    return f"{prefix}{int(time.time()*1000):012x}{secrets.token_hex(6)}"


def _to_out(s: Score) -> ScoreOut:
    return ScoreOut(
        id=s.id,
        trace_id=s.trace_id,
        observation_id=s.observation_id,
        name=s.name,
        data_type=s.data_type,
        value=s.value,
        string_value=s.string_value,
        source=s.source,
        comment=s.comment,
        created_at=s.created_at,
    )


@router.post("", response_model=ScoreOut)
def create_score(
    payload: ScoreCreate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> ScoreOut:
    trace = db.get(Trace, payload.trace_id)
    if trace is None or trace.project_id != project_id:
        raise HTTPException(status_code=404, detail="Trace not found")

    value = payload.value
    if payload.data_type == "BOOLEAN" and value is not None:
        value = 1.0 if value else 0.0

    score = Score(
        id=payload.id or _new_id("score_"),
        project_id=project_id,
        trace_id=payload.trace_id,
        observation_id=payload.observation_id,
        name=payload.name,
        data_type=payload.data_type,
        value=value,
        string_value=payload.string_value,
        source=payload.source,
        comment=payload.comment,
    )
    db.add(score)
    db.commit()
    db.refresh(score)
    return _to_out(score)


@router.get("", response_model=ScoreListResponse)
def list_scores(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    trace_id: Optional[str] = Query(default=None, alias="traceId"),
    observation_id: Optional[str] = Query(default=None, alias="observationId"),
    source: Optional[str] = Query(default=None, regex="^(HUMAN|API|EVAL)$"),
    name: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> ScoreListResponse:
    conds = [Score.project_id == project_id]
    if trace_id:
        conds.append(Score.trace_id == trace_id)
    if observation_id:
        conds.append(Score.observation_id == observation_id)
    if source:
        conds.append(Score.source == source)
    if name:
        conds.append(Score.name == name)

    total = db.scalar(select(sqlfunc.count(Score.id)).where(*conds)) or 0
    rows = db.scalars(
        select(Score).where(*conds).order_by(Score.created_at.desc()).limit(limit)
    ).all()
    return ScoreListResponse(data=[_to_out(s) for s in rows], total=int(total))


@router.patch("/{score_id}", response_model=ScoreOut)
def update_score(
    score_id: str,
    payload: ScoreUpdate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> ScoreOut:
    """Update an existing score (for annotation corrections)."""
    score = db.get(Score, score_id)
    if score is None or score.project_id != project_id:
        raise HTTPException(status_code=404, detail="Score not found")

    if payload.name is not None:
        score.name = payload.name
    if payload.data_type is not None:
        score.data_type = payload.data_type
    if payload.value is not None:
        score.value = payload.value
    if payload.string_value is not None:
        score.string_value = payload.string_value
    if payload.comment is not None:
        score.comment = payload.comment

    db.commit()
    db.refresh(score)
    return _to_out(score)


@router.delete("/{score_id}")
def delete_score(
    score_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Delete a score."""
    score = db.get(Score, score_id)
    if score is None or score.project_id != project_id:
        raise HTTPException(status_code=404, detail="Score not found")

    db.delete(score)
    db.commit()
    return {"ok": True}
