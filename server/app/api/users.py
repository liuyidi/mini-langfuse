"""Users analytics API (M21) — per-user aggregation over traces."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..models import Observation, Trace

router = APIRouter(prefix="/api/public/users", tags=["users"])


@router.get("")
def list_users(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=500),
):
    """List all unique user IDs with basic stats."""
    rows = db.execute(
        select(
            Trace.user_id,
            sqlfunc.count(Trace.id).label("trace_count"),
            sqlfunc.min(Trace.timestamp).label("first_seen"),
            sqlfunc.max(Trace.timestamp).label("last_seen"),
            sqlfunc.count(sqlfunc.distinct(Trace.session_id)).label("session_count"),
        )
        .where(Trace.project_id == project_id, Trace.user_id.isnot(None))
        .group_by(Trace.user_id)
        .order_by(sqlfunc.count(Trace.id).desc())
        .limit(limit)
    ).all()

    users = []
    for row in rows:
        # Get cost and token totals for this user
        totals = db.execute(
            select(
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_tokens), 0),
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_cost_usd), 0.0),
            )
            .select_from(Observation)
            .join(Trace, Trace.id == Observation.trace_id)
            .where(Trace.project_id == project_id, Trace.user_id == row.user_id)
        ).one()

        users.append({
            "user_id": row.user_id,
            "trace_count": int(row.trace_count),
            "session_count": int(row.session_count),
            "first_seen": row.first_seen.isoformat() if row.first_seen else None,
            "last_seen": row.last_seen.isoformat() if row.last_seen else None,
            "total_tokens": int(totals[0] or 0),
            "total_cost_usd": round(float(totals[1] or 0), 6),
        })

    return {"users": users, "total": len(users)}


@router.get("/analytics")
def users_analytics(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
):
    """Aggregate user analytics: activity trends, top users, retention."""
    if to_timestamp is None:
        to_timestamp = datetime.now(timezone.utc)
    if from_timestamp is None:
        from_timestamp = to_timestamp - timedelta(days=30)

    conds = [
        Trace.project_id == project_id,
        Trace.timestamp >= from_timestamp,
        Trace.timestamp <= to_timestamp,
        Trace.user_id.isnot(None),
    ]

    # --- Top users by trace count ---
    top_users = db.execute(
        select(
            Trace.user_id,
            sqlfunc.count(Trace.id).label("trace_count"),
            sqlfunc.count(sqlfunc.distinct(Trace.session_id)).label("session_count"),
        )
        .where(*conds)
        .group_by(Trace.user_id)
        .order_by(sqlfunc.count(Trace.id).desc())
        .limit(20)
    ).all()

    top_users_data = []
    for row in top_users:
        totals = db.execute(
            select(
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_tokens), 0),
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_cost_usd), 0.0),
            )
            .select_from(Observation)
            .join(Trace, Trace.id == Observation.trace_id)
            .where(*conds, Trace.user_id == row.user_id)
        ).one()
        top_users_data.append({
            "user_id": row.user_id,
            "trace_count": int(row.trace_count),
            "session_count": int(row.session_count),
            "total_tokens": int(totals[0] or 0),
            "total_cost_usd": round(float(totals[1] or 0), 6),
        })

    # --- User activity over time (daily) ---
    dialect = db.bind.dialect.name if db.bind else "sqlite"
    if dialect == "postgresql":
        bucket_expr = sqlfunc.date_trunc("day", Trace.timestamp)
    else:
        bucket_expr = sqlfunc.strftime("%Y-%m-%d 00:00:00", Trace.timestamp)

    daily_activity = db.execute(
        select(
            bucket_expr.label("date"),
            sqlfunc.count(Trace.id).label("trace_count"),
            sqlfunc.count(sqlfunc.distinct(Trace.user_id)).label("active_users"),
        )
        .where(*conds)
        .group_by(bucket_expr)
        .order_by(bucket_expr)
    ).all()

    timeseries = []
    for row in daily_activity:
        ts = row.date
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
        elif isinstance(ts, datetime) and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        timeseries.append({
            "date": ts.isoformat(),
            "trace_count": int(row.trace_count),
            "active_users": int(row.active_users),
        })

    # --- Summary stats ---
    total_users = db.scalar(
        select(sqlfunc.count(sqlfunc.distinct(Trace.user_id))).where(*conds)
    ) or 0
    total_traces = db.scalar(
        select(sqlfunc.count(Trace.id)).where(*conds)
    ) or 0
    total_sessions = db.scalar(
        select(sqlfunc.count(sqlfunc.distinct(Trace.session_id))).where(*conds, Trace.session_id.isnot(None))
    ) or 0

    return {
        "period": {
            "from": from_timestamp.isoformat(),
            "to": to_timestamp.isoformat(),
        },
        "summary": {
            "total_users": int(total_users),
            "total_traces": int(total_traces),
            "total_sessions": int(total_sessions),
            "avg_traces_per_user": round(int(total_traces) / max(1, int(total_users)), 1),
        },
        "top_users": top_users_data,
        "daily_activity": timeseries,
    }
