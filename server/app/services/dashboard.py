"""Dashboard aggregation queries (M11).

All functions accept a db session, project_id, and optional time range.
Returns plain dicts/dataclasses matching the schemas in schemas/dashboard.py.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import case, func as sqlfunc, literal_column, text
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Observation, Trace
from ..schemas.dashboard import (
    HistogramBucket,
    LatencyDistributionResponse,
    ModelStats,
    ModelsResponse,
    PeriodRange,
    SummaryResponse,
    TimeseriesBucket,
    TimeseriesResponse,
    TopTraceItem,
    TopTracesResponse,
)


def _default_time_range() -> tuple[datetime, datetime]:
    """Default: last 24 hours."""
    to_ts = datetime.now(timezone.utc)
    from_ts = to_ts - timedelta(hours=24)
    return from_ts, to_ts


# =============================================================================
# Summary (KPI cards)
# =============================================================================

def get_summary(
    db: Session,
    project_id: str,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
) -> SummaryResponse:
    """Aggregate KPI metrics for the dashboard summary cards."""
    if from_ts is None or to_ts is None:
        from_ts, to_ts = _default_time_range()

    # Basic counts from traces
    trace_row = db.execute(
        select(sqlfunc.count(Trace.id)).where(
            Trace.project_id == project_id,
            Trace.timestamp >= from_ts,
            Trace.timestamp <= to_ts,
        )
    ).scalar() or 0

    # Observation aggregates via JOIN
    obs_row = db.execute(
        select(
            sqlfunc.count(Observation.id),
            sqlfunc.coalesce(sqlfunc.sum(Observation.total_tokens), 0),
            sqlfunc.coalesce(sqlfunc.sum(Observation.total_cost_usd), 0.0),
        )
        .select_from(Observation)
        .join(Trace, Trace.id == Observation.trace_id)
        .where(
            Trace.project_id == project_id,
            Trace.timestamp >= from_ts,
            Trace.timestamp <= to_ts,
        )
    ).one()

    total_obs = obs_row[0] or 0
    total_tokens = int(obs_row[1] or 0)
    total_cost = float(obs_row[2] or 0.0)

    # Latency percentiles (trace-level: min start → max end)
    # Using a subquery for trace-level duration
    trace_durations = db.execute(
        select(
            sqlfunc.min(Observation.start_time).label("start"),
            sqlfunc.max(Observation.end_time).label("end"),
        )
        .select_from(Observation)
        .join(Trace, Trace.id == Observation.trace_id)
        .where(
            Trace.project_id == project_id,
            Trace.timestamp >= from_ts,
            Trace.timestamp <= to_ts,
            Observation.end_time.isnot(None),
        )
        .group_by(Trace.id)
    ).all()

    latencies_ms: list[float] = []
    for row in trace_durations:
        if row.start and row.end:
            dur_ms = (row.end - row.start).total_seconds() * 1000.0
            latencies_ms.append(dur_ms)

    latencies_ms.sort()
    n = len(latencies_ms)

    def _percentile(data: list[float], p: float) -> Optional[float]:
        if not data:
            return None
        idx = int(len(data) * p / 100.0)
        idx = min(idx, len(data) - 1)
        return round(data[idx], 2)

    avg_latency = round(sum(latencies_ms) / n, 2) if n > 0 else None

    return SummaryResponse(
        period=PeriodRange(from_ts=from_ts, to_ts=to_ts),
        total_traces=int(trace_row),
        total_observations=total_obs,
        total_tokens=total_tokens,
        total_cost_usd=round(total_cost, 6),
        avg_latency_ms=avg_latency,
        p50_latency_ms=_percentile(latencies_ms, 50),
        p95_latency_ms=_percentile(latencies_ms, 95),
        p99_latency_ms=_percentile(latencies_ms, 99),
    )


# =============================================================================
# Timeseries
# =============================================================================

def _auto_granularity(from_ts: datetime, to_ts: datetime) -> str:
    """Choose granularity based on time range."""
    span_hours = (to_ts - from_ts).total_seconds() / 3600
    if span_hours <= 24:
        return "1h"
    elif span_hours <= 7 * 24:
        return "6h"
    elif span_hours <= 30 * 24:
        return "1d"
    else:
        return "7d"


def _time_bucket_expr(column, granularity: str, dialect: str):
    """Return a SQL expression that truncates a timestamp to the given granularity."""
    if dialect == "postgresql":
        # PostgreSQL: DATE_TRUNC('hour', column)
        return sqlfunc.date_trunc(granularity, column)
    else:
        # SQLite: strftime-based truncation
        if granularity == "1h":
            return sqlfunc.strftime("%Y-%m-%d %H:00:00", column)
        elif granularity == "6h":
            # Round hour down to nearest 6
            return sqlfunc.strftime(
                "%Y-%m-%d", column
            ) + " " + sqlfunc.printf(
                "%02d:00:00",
                (sqlfunc.cast(sqlfunc.strftime("%H", column), sqlfunc.Integer) / 6 * 6),
            )
        elif granularity == "1d":
            return sqlfunc.strftime("%Y-%m-%d 00:00:00", column)
        elif granularity == "7d":
            # Use strftime week start (Monday)
            return sqlfunc.strftime("%Y-%m-%d 00:00:00", column)
        else:
            return sqlfunc.strftime("%Y-%m-%d %H:00:00", column)


def get_timeseries(
    db: Session,
    project_id: str,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
    granularity: Optional[str] = None,
    metric: str = "cost",
) -> TimeseriesResponse:
    """Aggregate a metric over time buckets."""
    if from_ts is None or to_ts is None:
        from_ts, to_ts = _default_time_range()

    if granularity is None:
        granularity = _auto_granularity(from_ts, to_ts)

    dialect = db.bind.dialect.name if db.bind else "sqlite"

    # Build the time bucket expression
    bucket_expr = _time_bucket_expr(Trace.timestamp, granularity, dialect)

    if metric == "traces":
        # Count traces per bucket
        rows = db.execute(
            select(
                bucket_expr.label("bucket"),
                sqlfunc.count(Trace.id).label("value"),
                sqlfunc.count(Trace.id).label("count"),
            )
            .where(
                Trace.project_id == project_id,
                Trace.timestamp >= from_ts,
                Trace.timestamp <= to_ts,
            )
            .group_by(bucket_expr)
            .order_by(bucket_expr)
        ).all()
    elif metric == "cost":
        # Sum cost per bucket
        rows = db.execute(
            select(
                bucket_expr.label("bucket"),
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_cost_usd), 0.0).label("value"),
                sqlfunc.count(sqlfunc.distinct(Trace.id)).label("count"),
            )
            .select_from(Observation)
            .join(Trace, Trace.id == Observation.trace_id)
            .where(
                Trace.project_id == project_id,
                Trace.timestamp >= from_ts,
                Trace.timestamp <= to_ts,
            )
            .group_by(bucket_expr)
            .order_by(bucket_expr)
        ).all()
    elif metric == "tokens":
        # Sum tokens per bucket
        rows = db.execute(
            select(
                bucket_expr.label("bucket"),
                sqlfunc.coalesce(sqlfunc.sum(Observation.total_tokens), 0).label("value"),
                sqlfunc.count(sqlfunc.distinct(Trace.id)).label("count"),
            )
            .select_from(Observation)
            .join(Trace, Trace.id == Observation.trace_id)
            .where(
                Trace.project_id == project_id,
                Trace.timestamp >= from_ts,
                Trace.timestamp <= to_ts,
            )
            .group_by(bucket_expr)
            .order_by(bucket_expr)
        ).all()
    elif metric == "latency":
        # Avg trace duration per bucket (trace-level)
        trace_dur = (
            select(
                Trace.id.label("trace_id"),
                Trace.timestamp,
                (
                    sqlfunc.julianday(sqlfunc.max(Observation.end_time))
                    - sqlfunc.julianday(sqlfunc.min(Observation.start_time))
                ).label("dur_days"),
            )
            .select_from(Observation)
            .join(Trace, Trace.id == Observation.trace_id)
            .where(
                Trace.project_id == project_id,
                Trace.timestamp >= from_ts,
                Trace.timestamp <= to_ts,
                Observation.end_time.isnot(None),
            )
            .group_by(Trace.id)
        ).subquery()

        bucket_expr2 = _time_bucket_expr(trace_dur.c.timestamp, granularity, dialect)
        rows = db.execute(
            select(
                bucket_expr2.label("bucket"),
                sqlfunc.avg(trace_dur.c.dur_days * 86400000).label("value"),
                sqlfunc.count(trace_dur.c.trace_id).label("count"),
            )
            .group_by(bucket_expr2)
            .order_by(bucket_expr2)
        ).all()
    else:
        rows = []

    buckets = []
    for row in rows:
        if row.bucket:
            ts = row.bucket
            if isinstance(ts, str):
                ts = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)
            elif isinstance(ts, datetime) and ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            buckets.append(TimeseriesBucket(
                timestamp=ts,
                value=round(float(row.value or 0), 6),
                count=int(row.count or 0),
            ))

    return TimeseriesResponse(
        granularity=granularity,
        metric=metric,
        buckets=buckets,
    )


# =============================================================================
# Model comparison
# =============================================================================

def get_model_stats(
    db: Session,
    project_id: str,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
) -> ModelsResponse:
    """Aggregate generation stats grouped by model."""
    if from_ts is None or to_ts is None:
        from_ts, to_ts = _default_time_range()

    rows = db.execute(
        select(
            Observation.model,
            sqlfunc.count(Observation.id).label("total_obs"),
            sqlfunc.coalesce(sqlfunc.sum(Observation.total_tokens), 0).label("total_tokens"),
            sqlfunc.coalesce(sqlfunc.sum(Observation.total_cost_usd), 0.0).label("total_cost"),
            sqlfunc.avg(Observation.prompt_tokens).label("avg_prompt"),
            sqlfunc.avg(Observation.completion_tokens).label("avg_completion"),
        )
        .select_from(Observation)
        .join(Trace, Trace.id == Observation.trace_id)
        .where(
            Trace.project_id == project_id,
            Trace.timestamp >= from_ts,
            Trace.timestamp <= to_ts,
            Observation.type == "GENERATION",
            Observation.model.isnot(None),
        )
        .group_by(Observation.model)
        .order_by(sqlfunc.sum(Observation.total_cost_usd).desc())
    ).all()

    # Calculate avg latency per model
    model_latencies: dict[str, float] = {}
    latency_rows = db.execute(
        select(
            Observation.model,
            sqlfunc.avg(
                (sqlfunc.julianday(Observation.end_time) - sqlfunc.julianday(Observation.start_time)) * 86400000
            ).label("avg_ms"),
        )
        .select_from(Observation)
        .join(Trace, Trace.id == Observation.trace_id)
        .where(
            Trace.project_id == project_id,
            Trace.timestamp >= from_ts,
            Trace.timestamp <= to_ts,
            Observation.type == "GENERATION",
            Observation.model.isnot(None),
            Observation.end_time.isnot(None),
        )
        .group_by(Observation.model)
    ).all()
    for row in latency_rows:
        model_latencies[row.model] = round(float(row.avg_ms or 0), 2)

    models = []
    for row in rows:
        models.append(ModelStats(
            model=row.model,
            total_observations=int(row.total_obs),
            total_tokens=int(row.total_tokens),
            total_cost_usd=round(float(row.total_cost), 6),
            avg_latency_ms=model_latencies.get(row.model),
            avg_prompt_tokens=round(float(row.avg_prompt), 1) if row.avg_prompt else None,
            avg_completion_tokens=round(float(row.avg_completion), 1) if row.avg_completion else None,
        ))

    return ModelsResponse(
        period=PeriodRange(from_ts=from_ts, to_ts=to_ts),
        models=models,
    )


# =============================================================================
# Latency distribution (histogram)
# =============================================================================

# Predefined bucket boundaries (in ms)
LATENCY_BUCKETS = [
    ("0-100ms", 0, 100),
    ("100-250ms", 100, 250),
    ("250-500ms", 250, 500),
    ("500ms-1s", 500, 1000),
    ("1-2s", 1000, 2000),
    ("2-5s", 2000, 5000),
    ("5s+", 5000, float("inf")),
]


def get_latency_distribution(
    db: Session,
    project_id: str,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
) -> LatencyDistributionResponse:
    """Build a histogram of trace-level latencies."""
    if from_ts is None or to_ts is None:
        from_ts, to_ts = _default_time_range()

    # Get trace-level durations
    trace_durations = db.execute(
        select(
            Trace.id,
            sqlfunc.min(Observation.start_time).label("start"),
            sqlfunc.max(Observation.end_time).label("end"),
        )
        .select_from(Observation)
        .join(Trace, Trace.id == Observation.trace_id)
        .where(
            Trace.project_id == project_id,
            Trace.timestamp >= from_ts,
            Trace.timestamp <= to_ts,
            Observation.end_time.isnot(None),
        )
        .group_by(Trace.id)
    ).all()

    # Bucketize
    counts = {label: 0 for label, _, _ in LATENCY_BUCKETS}
    for row in trace_durations:
        if row.start and row.end:
            dur_ms = (row.end - row.start).total_seconds() * 1000.0
            for label, low, high in LATENCY_BUCKETS:
                if low <= dur_ms < high:
                    counts[label] += 1
                    break

    histogram = [
        HistogramBucket(bucket=label, count=count)
        for label, _, _ in LATENCY_BUCKETS
        for count in [counts[label]]
    ]

    return LatencyDistributionResponse(
        period=PeriodRange(from_ts=from_ts, to_ts=to_ts),
        histogram=histogram,
    )


# =============================================================================
# Top traces
# =============================================================================

def get_top_traces(
    db: Session,
    project_id: str,
    order_by: str = "cost",
    limit: int = 10,
    from_ts: Optional[datetime] = None,
    to_ts: Optional[datetime] = None,
) -> TopTracesResponse:
    """Get top traces by cost, latency, or tokens."""
    if from_ts is None or to_ts is None:
        from_ts, to_ts = _default_time_range()

    # Subquery: per-trace aggregates
    trace_agg = (
        select(
            Trace.id,
            Trace.name,
            Trace.timestamp,
            sqlfunc.coalesce(sqlfunc.sum(Observation.total_cost_usd), 0.0).label("cost"),
            sqlfunc.coalesce(sqlfunc.sum(Observation.total_tokens), 0).label("tokens"),
            sqlfunc.min(Observation.start_time).label("start"),
            sqlfunc.max(Observation.end_time).label("end"),
        )
        .select_from(Trace)
        .outerjoin(Observation, Observation.trace_id == Trace.id)
        .where(
            Trace.project_id == project_id,
            Trace.timestamp >= from_ts,
            Trace.timestamp <= to_ts,
        )
        .group_by(Trace.id)
    ).subquery()

    # Choose ordering
    if order_by == "cost":
        order_col = trace_agg.c.cost.desc()
    elif order_by == "latency":
        order_col = (
            sqlfunc.julianday(trace_agg.c.end) - sqlfunc.julianday(trace_agg.c.start)
        ).desc()
    elif order_by == "tokens":
        order_col = trace_agg.c.tokens.desc()
    else:
        order_col = trace_agg.c.cost.desc()

    rows = db.execute(
        select(trace_agg).order_by(order_col).limit(limit)
    ).all()

    traces = []
    for row in rows:
        latency_ms = None
        if row.start and row.end:
            latency_ms = round((row.end - row.start).total_seconds() * 1000.0, 2)
        traces.append(TopTraceItem(
            id=row.id,
            name=row.name,
            cost_usd=round(float(row.cost or 0), 6),
            latency_ms=latency_ms,
            tokens=int(row.tokens or 0),
            timestamp=row.timestamp,
        ))

    return TopTracesResponse(order_by=order_by, traces=traces)
