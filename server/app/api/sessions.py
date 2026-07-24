"""GET /api/public/sessions and /api/public/sessions/{id}"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..models import Observation, Trace
from ..schemas.session import SessionDetail, SessionListResponse, SessionSummary
from ..schemas.trace import TraceOut
from ..services.tree import aggregate_metrics, trace_to_dict

router = APIRouter(prefix="/api/public/sessions", tags=["sessions"])


def _session_totals_for(db: Session, project_id: str, session_id: str) -> dict:
    """Sum tokens/cost across all observations in the session's traces."""
    row = db.execute(
        select(
            sqlfunc.sum(Observation.total_tokens),
            sqlfunc.sum(Observation.total_cost_usd),
        )
        .select_from(Observation)
        .join(Trace, Trace.id == Observation.trace_id)
        .where(Trace.project_id == project_id, Trace.session_id == session_id)
    ).one()
    return {"total_tokens": row[0], "total_cost_usd": row[1]}


@router.get("", response_model=SessionListResponse)
def list_sessions(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    user_id: Optional[str] = Query(default=None, alias="userId"),
    limit: int = Query(default=50, ge=1, le=200),
    page: int = Query(default=1, ge=1),
) -> SessionListResponse:
    """Aggregate distinct session_ids for this project."""
    # We can't group in a single query easily across dialects for token/cost sums
    # from a joined table; do the group-by on traces here and pull totals per-row.
    conds = [Trace.project_id == project_id, Trace.session_id.is_not(None)]
    if user_id:
        conds.append(Trace.user_id == user_id)

    base = (
        select(
            Trace.session_id,
            sqlfunc.max(Trace.user_id).label("user_id"),  # sessions typically pin to one user
            sqlfunc.count(Trace.id).label("trace_count"),
            sqlfunc.min(Trace.timestamp).label("first_trace_at"),
            sqlfunc.max(Trace.timestamp).label("last_trace_at"),
        )
        .where(*conds)
        .group_by(Trace.session_id)
        .order_by(sqlfunc.max(Trace.timestamp).desc())
    )

    total_count = db.scalar(
        select(sqlfunc.count(sqlfunc.distinct(Trace.session_id))).where(*conds)
    ) or 0

    rows = db.execute(base.offset((page - 1) * limit).limit(limit)).all()

    out: list[SessionSummary] = []
    for r in rows:
        totals = _session_totals_for(db, project_id, r.session_id)
        out.append(
            SessionSummary(
                session_id=r.session_id,
                user_id=r.user_id,
                trace_count=int(r.trace_count),
                first_trace_at=r.first_trace_at,
                last_trace_at=r.last_trace_at,
                total_tokens=totals["total_tokens"],
                total_cost_usd=totals["total_cost_usd"],
            )
        )

    return SessionListResponse(data=out, total=int(total_count), page=page, limit=limit)


@router.get("/{session_id}", response_model=SessionDetail)
def get_session(
    session_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> SessionDetail:
    traces = db.scalars(
        select(Trace)
        .where(Trace.project_id == project_id, Trace.session_id == session_id)
        .order_by(Trace.timestamp.asc())
    ).all()
    if not traces:
        raise HTTPException(status_code=404, detail="Session not found")

    # Build trace list with aggregate metrics
    trace_outs: list[TraceOut] = []
    total_tokens = 0
    total_cost = 0.0
    for tr in traces:
        obs = db.scalars(select(Observation).where(Observation.trace_id == tr.id)).all()
        agg = aggregate_metrics(tr, obs)
        trace_outs.append(TraceOut(**trace_to_dict(tr), **agg))
        total_tokens += agg["total_tokens"] or 0
        total_cost += agg["total_cost_usd"] or 0.0

    return SessionDetail(
        session_id=session_id,
        user_id=traces[0].user_id,
        trace_count=len(traces),
        first_trace_at=traces[0].timestamp,
        last_trace_at=traces[-1].timestamp,
        total_tokens=total_tokens or None,
        total_cost_usd=total_cost or None,
        traces=trace_outs,
    )
