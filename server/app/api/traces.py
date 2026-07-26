"""GET /api/public/traces and /api/public/traces/{id} — with advanced filtering (M18) and export (M23)."""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, func as sqlfunc, or_, select, text
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
    # Basic filters
    user_id: Optional[str] = Query(default=None, alias="userId"),
    session_id: Optional[str] = Query(default=None, alias="sessionId"),
    name: Optional[str] = Query(default=None),
    # Time range
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
    # Tags
    tags: Optional[str] = Query(default=None, description="Comma-separated tags (OR match)"),
    tags_all: Optional[str] = Query(default=None, alias="tagsAll", description="Comma-separated tags (AND match)"),
    # Full-text search
    search: Optional[str] = Query(default=None),
    # Cost/latency range
    min_cost: Optional[float] = Query(default=None, alias="minCost"),
    max_cost: Optional[float] = Query(default=None, alias="maxCost"),
    min_latency: Optional[float] = Query(default=None, alias="minLatency"),
    max_latency: Optional[float] = Query(default=None, alias="maxLatency"),
    # Model / status / level
    model: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    level: Optional[str] = Query(default=None),
    # Ordering
    order_by: str = Query(default="timestamp", regex="^(timestamp|cost|latency|tokens)$"),
    order_direction: str = Query(default="desc", regex="^(asc|desc)$"),
    # Pagination
    limit: int = Query(default=50, ge=1, le=200),
    page: int = Query(default=1, ge=1),
) -> TraceListResponse:
    """List traces with advanced filtering."""
    conditions = [Trace.project_id == project_id]

    # Basic filters
    if user_id:
        conditions.append(Trace.user_id == user_id)
    if session_id:
        conditions.append(Trace.session_id == session_id)
    if name:
        conditions.append(Trace.name.ilike(f"%{name}%"))

    # Time range
    if from_timestamp:
        conditions.append(Trace.timestamp >= from_timestamp)
    if to_timestamp:
        conditions.append(Trace.timestamp <= to_timestamp)

    # Tags filter (OR match)
    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        if tag_list:
            dialect = db.bind.dialect.name if db.bind else "sqlite"
            if dialect == "postgresql":
                # Use jsonb ? operator
                tag_conds = [text(f"tags ? :tag_{i}").bindparams(**{f"tag_{i}": t}) for i, t in enumerate(tag_list)]
                conditions.append(or_(*tag_conds))
            else:
                # SQLite: use json_each
                tag_conds = [
                    text("EXISTS (SELECT 1 FROM json_each(traces.tags) WHERE value = :tag)").bindparams(tag=t)
                    for t in tag_list
                ]
                conditions.append(or_(*tag_conds))

    # Tags filter (AND match)
    if tags_all:
        tag_list = [t.strip() for t in tags_all.split(",") if t.strip()]
        if tag_list:
            dialect = db.bind.dialect.name if db.bind else "sqlite"
            for t in tag_list:
                if dialect == "postgresql":
                    conditions.append(text("tags ? :tag").bindparams(tag=t))
                else:
                    conditions.append(
                        text("EXISTS (SELECT 1 FROM json_each(traces.tags) WHERE value = :tag)").bindparams(tag=t)
                    )

    # Full-text search (input + output + name)
    if search:
        search_term = f"%{search}%"
        conditions.append(
            or_(
                Trace.name.ilike(search_term),
                Trace.input.cast(text("TEXT")).ilike(search_term),
                Trace.output.cast(text("TEXT")).ilike(search_term),
            )
        )

    # Model filter
    if model:
        conditions.append(
            Trace.id.in_(
                select(Observation.trace_id).where(
                    Observation.model.ilike(f"%{model}%")
                )
            )
        )

    # Status filter (on any observation)
    if status:
        conditions.append(
            Trace.id.in_(
                select(Observation.trace_id).where(Observation.status == status)
            )
        )

    # Level filter
    if level:
        conditions.append(
            Trace.id.in_(
                select(Observation.trace_id).where(Observation.level == level)
            )
        )

    # Cost / latency range (requires aggregation subquery)
    if min_cost is not None or max_cost is not None or min_latency is not None or max_latency is not None:
        # Build a subquery with trace-level aggregates
        cost_col = sqlfunc.coalesce(sqlfunc.sum(Observation.total_cost_usd), 0)
        # Use julianday for latency (SQLite compatible)
        latency_col = (
            sqlfunc.julianday(sqlfunc.max(Observation.end_time))
            - sqlfunc.julianday(sqlfunc.min(Observation.start_time))
        ) * 86400000  # convert days to ms

        agg_subq = (
            select(
                Trace.id.label("trace_id"),
                cost_col.label("agg_cost"),
                latency_col.label("agg_latency"),
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_tokens), 0).label("agg_tokens"),
            )
            .select_from(Trace)
            .outerjoin(Observation, Observation.trace_id == Trace.id)
            .where(Trace.project_id == project_id)
            .group_by(Trace.id)
        ).subquery()

        if min_cost is not None:
            conditions.append(agg_subq.c.agg_cost >= min_cost)
        if max_cost is not None:
            conditions.append(agg_subq.c.agg_cost <= max_cost)
        if min_latency is not None:
            conditions.append(agg_subq.c.agg_latency >= min_latency)
        if max_latency is not None:
            conditions.append(agg_subq.c.agg_latency <= max_latency)

        # Add trace_id IN subquery
        conditions.append(Trace.id.in_(select(agg_subq.c.trace_id)))

    # Count
    total_count = db.scalar(select(sqlfunc.count(Trace.id)).where(*conditions)) or 0

    # Ordering
    if order_by == "timestamp":
        order_col = Trace.timestamp.desc() if order_direction == "desc" else Trace.timestamp.asc()
    elif order_by == "cost":
        # Need subquery ordering
        cost_subq = (
            select(
                Trace.id.label("trace_id"),
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_cost_usd), 0).label("agg_cost"),
            )
            .select_from(Trace)
            .outerjoin(Observation, Observation.trace_id == Trace.id)
            .where(Trace.project_id == project_id)
            .group_by(Trace.id)
        ).subquery()
        order_col = cost_subq.c.agg_cost.desc() if order_direction == "desc" else cost_subq.c.agg_cost.asc()
        conditions.append(Trace.id.in_(select(cost_subq.c.trace_id)))
    elif order_by == "latency":
        lat_subq = (
            select(
                Trace.id.label("trace_id"),
                ((sqlfunc.julianday(sqlfunc.max(Observation.end_time)) - sqlfunc.julianday(sqlfunc.min(Observation.start_time))) * 86400000).label("agg_latency"),
            )
            .select_from(Trace)
            .outerjoin(Observation, Observation.trace_id == Trace.id)
            .where(Trace.project_id == project_id)
            .group_by(Trace.id)
        ).subquery()
        order_col = lat_subq.c.agg_latency.desc() if order_direction == "desc" else lat_subq.c.agg_latency.asc()
        conditions.append(Trace.id.in_(select(lat_subq.c.trace_id)))
    elif order_by == "tokens":
        tok_subq = (
            select(
                Trace.id.label("trace_id"),
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_tokens), 0).label("agg_tokens"),
            )
            .select_from(Trace)
            .outerjoin(Observation, Observation.trace_id == Trace.id)
            .where(Trace.project_id == project_id)
            .group_by(Trace.id)
        ).subquery()
        order_col = tok_subq.c.agg_tokens.desc() if order_direction == "desc" else tok_subq.c.agg_tokens.asc()
        conditions.append(Trace.id.in_(select(tok_subq.c.trace_id)))
    else:
        order_col = Trace.timestamp.desc()

    stmt = (
        select(Trace)
        .where(*conditions)
        .order_by(order_col)
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


@router.get("/facets")
def get_trace_facets(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Get facet values for filter dropdowns."""
    # Top trace names
    names = db.execute(
        select(Trace.name, sqlfunc.count(Trace.id).label("count"))
        .where(Trace.project_id == project_id, Trace.name.isnot(None))
        .group_by(Trace.name)
        .order_by(sqlfunc.count(Trace.id).desc())
        .limit(50)
    ).all()

    # Top user IDs
    users = db.execute(
        select(Trace.user_id, sqlfunc.count(Trace.id).label("count"))
        .where(Trace.project_id == project_id, Trace.user_id.isnot(None))
        .group_by(Trace.user_id)
        .order_by(sqlfunc.count(Trace.id).desc())
        .limit(100)
    ).all()

    # Top tags
    dialect = db.bind.dialect.name if db.bind else "sqlite"
    if dialect == "postgresql":
        tags_rows = db.execute(
            text("SELECT value, COUNT(*) as cnt FROM traces, jsonb_array_elements_text(tags) AS value WHERE project_id = :pid GROUP BY value ORDER BY cnt DESC LIMIT 100").bindparams(pid=project_id)
        ).all()
    else:
        tags_rows = db.execute(
            text("SELECT value, COUNT(*) as cnt FROM traces, json_each(tags) WHERE project_id = :pid GROUP BY value ORDER BY cnt DESC LIMIT 100").bindparams(pid=project_id)
        ).all()

    # Top models
    models = db.execute(
        select(Observation.model, sqlfunc.count(Observation.id).label("count"))
        .select_from(Observation)
        .join(Trace, Trace.id == Observation.trace_id)
        .where(Trace.project_id == project_id, Observation.type == "GENERATION", Observation.model.isnot(None))
        .group_by(Observation.model)
        .order_by(sqlfunc.count(Observation.id).desc())
        .limit(50)
    ).all()

    # Status counts
    status_counts = db.execute(
        select(Observation.status, sqlfunc.count(Observation.id).label("count"))
        .select_from(Observation)
        .join(Trace, Trace.id == Observation.trace_id)
        .where(Trace.project_id == project_id)
        .group_by(Observation.status)
    ).all()

    return {
        "names": [{"value": r.name, "count": int(r.count)} for r in names],
        "users": [{"value": r.user_id, "count": int(r.count)} for r in users],
        "tags": [{"value": r[0], "count": int(r[1])} for r in tags_rows],
        "models": [{"value": r.model, "count": int(r.count)} for r in models],
        "status_counts": {r.status: int(r.count) for r in status_counts if r.status},
    }


@router.get("/export")
def export_traces(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    format: str = Query(default="json", regex="^(json|csv)$"),
    # All the same filters as list_traces
    user_id: Optional[str] = Query(default=None, alias="userId"),
    session_id: Optional[str] = Query(default=None, alias="sessionId"),
    name: Optional[str] = Query(default=None),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
    search: Optional[str] = Query(default=None),
    tags: Optional[str] = Query(default=None),
    model: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=10000),
):
    """Export traces as JSON or CSV with filters applied.

    Supports the same filters as GET /traces (name, tags, userId, model, status,
    search, time range). Max 10,000 traces per export.
    """
    conditions = [Trace.project_id == project_id]

    if user_id:
        conditions.append(Trace.user_id == user_id)
    if session_id:
        conditions.append(Trace.session_id == session_id)
    if name:
        conditions.append(Trace.name.ilike(f"%{name}%"))
    if from_timestamp:
        conditions.append(Trace.timestamp >= from_timestamp)
    if to_timestamp:
        conditions.append(Trace.timestamp <= to_timestamp)
    if search:
        search_term = f"%{search}%"
        conditions.append(
            or_(
                Trace.name.ilike(search_term),
                Trace.input.cast(text("TEXT")).ilike(search_term),
                Trace.output.cast(text("TEXT")).ilike(search_term),
            )
        )
    if model:
        conditions.append(
            Trace.id.in_(
                select(Observation.trace_id).where(Observation.model.ilike(f"%{model}%"))
            )
        )
    if status:
        conditions.append(
            Trace.id.in_(
                select(Observation.trace_id).where(Observation.status == status)
            )
        )

    traces = db.scalars(
        select(Trace)
        .where(*conditions)
        .order_by(Trace.timestamp.desc())
        .limit(limit)
    ).all()

    # Build output rows with aggregated metrics
    rows = []
    for tr in traces:
        obs = db.scalars(select(Observation).where(Observation.trace_id == tr.id)).all()
        agg = aggregate_metrics(tr, obs)
        row = {**trace_to_dict(tr), **agg}
        # Flatten JSON fields for CSV
        if format == "csv":
            if isinstance(row.get("input"), (dict, list)):
                row["input"] = json.dumps(row["input"], ensure_ascii=False)
            if isinstance(row.get("output"), (dict, list)):
                row["output"] = json.dumps(row["output"], ensure_ascii=False)
            if isinstance(row.get("metadata"), (dict, list)):
                row["metadata"] = json.dumps(row["metadata"], ensure_ascii=False)
            if isinstance(row.get("tags"), list):
                row["tags"] = ",".join(row["tags"])
        rows.append(row)

    if format == "csv":
        # Stream CSV
        if not rows:
            return StreamingResponse(
                iter(["id,name,user_id,session_id,timestamp,duration_ms,total_tokens,total_cost_usd,observation_count\n"]),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=traces.csv"},
            )

        fieldnames = [
            "id", "name", "user_id", "session_id", "timestamp",
            "duration_ms", "total_tokens", "total_cost_usd", "observation_count",
            "input", "output", "metadata", "tags", "release", "version",
        ]

        def generate():
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

            for row in rows:
                writer.writerow(row)
                yield buf.getvalue()
                buf.seek(0)
                buf.truncate(0)

        return StreamingResponse(
            generate(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=traces.csv"},
        )

    else:
        # JSON export
        return rows


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
