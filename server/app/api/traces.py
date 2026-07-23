"""GET /api/public/traces and /api/public/traces/{id}"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..models import Observation, Trace
from ..schemas.trace import TraceDetail, TraceListResponse, TraceOut
from ..services.tree import aggregate_metrics, build_tree, trace_to_dict

router = APIRouter(prefix="/api/public/traces", tags=["traces"])


@router.get("", response_model=TraceListResponse)
def list_traces(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    user_id: Optional[str] = Query(default=None, alias="userId"),
    session_id: Optional[str] = Query(default=None, alias="sessionId"),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
    limit: int = Query(default=50, ge=1, le=200),
    page: int = Query(default=1, ge=1),
) -> TraceListResponse:
    conditions = [Trace.project_id == project_id]
    if user_id:
        conditions.append(Trace.user_id == user_id)
    if session_id:
        conditions.append(Trace.session_id == session_id)
    if from_timestamp:
        conditions.append(Trace.timestamp >= from_timestamp)
    if to_timestamp:
        conditions.append(Trace.timestamp <= to_timestamp)

    total_count = db.scalar(select(sqlfunc.count(Trace.id)).where(*conditions)) or 0

    stmt = (
        select(Trace)
        .where(*conditions)
        .order_by(Trace.timestamp.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    traces = db.scalars(stmt).all()

    out: list[TraceOut] = []
    for tr in traces:
        obs = db.scalars(select(Observation).where(Observation.trace_id == tr.id)).all()
        agg = aggregate_metrics(tr, obs)
        out.append(TraceOut(**trace_to_dict(tr), **agg))

    return TraceListResponse(data=out, total=int(total_count), page=page, limit=limit)


@router.get("/{trace_id}", response_model=TraceDetail)
def get_trace(
    trace_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> TraceDetail:
    trace = db.get(Trace, trace_id)
    if trace is None or trace.project_id != project_id:
        raise HTTPException(status_code=404, detail="Trace not found")

    obs = db.scalars(select(Observation).where(Observation.trace_id == trace_id)).all()
    tree = build_tree(obs)
    agg = aggregate_metrics(trace, obs)
    return TraceDetail(**trace_to_dict(trace), **agg, observations=tree)
