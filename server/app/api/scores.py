"""Scores API - POST /scores, GET /scores?traceId=..., GET /scores/analytics"""
from __future__ import annotations

import secrets
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

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


# =============================================================================
# Analytics endpoint
# =============================================================================

@router.get("/analytics")
def scores_analytics(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
    granularity: str = Query(default="1d", regex="^(1h|6h|1d|7d)$"),
    name: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),
):
    """Score analytics: summary stats, time series, and distribution.

    Returns:
    - summary: per-score-name stats (count, avg, min, max)
    - timeseries: scores over time grouped by score name
    - distribution: histogram of numeric score values
    """
    if to_timestamp is None:
        to_timestamp = datetime.now(timezone.utc)
    if from_timestamp is None:
        from_timestamp = to_timestamp - timedelta(days=30)

    conds = [
        Score.project_id == project_id,
        Score.created_at >= from_timestamp,
        Score.created_at <= to_timestamp,
    ]
    if name:
        conds.append(Score.name == name)
    if source:
        conds.append(Score.source == source)

    # --- Summary stats per score name ---
    summary_rows = db.execute(
        select(
            Score.name,
            Score.data_type,
            Score.source,
            sqlfunc.count(Score.id).label("count"),
            sqlfunc.avg(Score.value).label("avg_value"),
            sqlfunc.min(Score.value).label("min_value"),
            sqlfunc.max(Score.value).label("max_value"),
        )
        .where(*conds)
        .group_by(Score.name, Score.data_type, Score.source)
    ).all()

    summary = []
    for row in summary_rows:
        summary.append({
            "name": row.name,
            "data_type": row.data_type,
            "source": row.source,
            "count": int(row.count),
            "avg_value": round(float(row.avg_value), 4) if row.avg_value is not None else None,
            "min_value": round(float(row.min_value), 4) if row.min_value is not None else None,
            "max_value": round(float(row.max_value), 4) if row.max_value is not None else None,
        })

    # --- Time series ---
    # Detect dialect for time bucketing
    dialect = db.bind.dialect.name if db.bind else "sqlite"
    if dialect == "postgresql":
        bucket_expr = sqlfunc.date_trunc(granularity, Score.created_at)
    else:
        if granularity == "1h":
            bucket_expr = sqlfunc.strftime("%Y-%m-%d %H:00:00", Score.created_at)
        elif granularity == "6h":
            bucket_expr = sqlfunc.strftime("%Y-%m-%d", Score.created_at)
        elif granularity == "1d":
            bucket_expr = sqlfunc.strftime("%Y-%m-%d 00:00:00", Score.created_at)
        else:
            bucket_expr = sqlfunc.strftime("%Y-%m-%d 00:00:00", Score.created_at)

    ts_rows = db.execute(
        select(
            bucket_expr.label("bucket"),
            Score.name,
            sqlfunc.count(Score.id).label("count"),
            sqlfunc.avg(Score.value).label("avg_value"),
        )
        .where(*conds, Score.value.isnot(None))
        .group_by(bucket_expr, Score.name)
        .order_by(bucket_expr)
    ).all()

    timeseries = []
    for row in ts_rows:
        ts = row.bucket
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
        elif isinstance(ts, datetime) and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        timeseries.append({
            "timestamp": ts.isoformat(),
            "name": row.name,
            "count": int(row.count),
            "avg_value": round(float(row.avg_value), 4) if row.avg_value is not None else None,
        })

    # --- Distribution (histogram for numeric scores) ---
    numeric_scores = db.execute(
        select(Score.name, Score.value)
        .where(*conds, Score.value.isnot(None), Score.data_type == "NUMERIC")
    ).all()

    # Build histogram buckets: 1-2, 2-3, 3-4, 4-5
    buckets = {"1-2": 0, "2-3": 0, "3-4": 0, "4-5": 0}
    by_name: dict[str, dict[str, int]] = defaultdict(lambda: {"1-2": 0, "2-3": 0, "3-4": 0, "4-5": 0})
    for row in numeric_scores:
        v = float(row.value)
        if v < 2:
            bucket = "1-2"
        elif v < 3:
            bucket = "2-3"
        elif v < 4:
            bucket = "3-4"
        else:
            bucket = "4-5"
        buckets[bucket] = buckets.get(bucket, 0) + 1
        by_name[row.name][bucket] = by_name[row.name].get(bucket, 0) + 1

    distribution = [
        {"bucket": k, "count": v}
        for k, v in buckets.items()
    ]

    distribution_by_name = [
        {"name": name_val, "histogram": [{"bucket": k, "count": v} for k, v in hist.items()]}
        for name_val, hist in by_name.items()
    ]

    # --- Categorical distribution ---
    categorical_scores = db.execute(
        select(Score.name, Score.string_value, sqlfunc.count(Score.id).label("count"))
        .where(*conds, Score.data_type == "CATEGORICAL", Score.string_value.isnot(None))
        .group_by(Score.name, Score.string_value)
    ).all()

    categorical_distribution = []
    cat_by_name: dict[str, list] = defaultdict(list)
    for row in categorical_scores:
        cat_by_name[row.name].append({"value": row.string_value, "count": int(row.count)})
    for name_val, items in cat_by_name.items():
        categorical_distribution.append({"name": name_val, "categories": items})

    return {
        "period": {"from": from_timestamp.isoformat(), "to": to_timestamp.isoformat()},
        "granularity": granularity,
        "total_scores": sum(s["count"] for s in summary),
        "summary": summary,
        "timeseries": timeseries,
        "distribution": distribution,
        "distribution_by_name": distribution_by_name,
        "categorical_distribution": categorical_distribution,
    }
