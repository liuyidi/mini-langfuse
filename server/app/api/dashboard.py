"""Dashboard aggregation APIs (M11)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..schemas.dashboard import (
    LatencyDistributionResponse,
    ModelsResponse,
    SummaryResponse,
    TimeseriesResponse,
    TopTracesResponse,
)
from ..services import dashboard as dashboard_svc

router = APIRouter(prefix="/api/public/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=SummaryResponse)
def dashboard_summary(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
) -> SummaryResponse:
    """KPI summary: total traces, cost, tokens, latency percentiles."""
    return dashboard_svc.get_summary(db, project_id, from_timestamp, to_timestamp)


@router.get("/timeseries", response_model=TimeseriesResponse)
def dashboard_timeseries(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
    granularity: Optional[str] = Query(default=None, regex="^(1h|6h|1d|7d)$"),
    metric: str = Query(default="cost", regex="^(cost|tokens|traces|latency)$"),
) -> TimeseriesResponse:
    """Timeseries data for trend charts (cost, tokens, traces, latency)."""
    return dashboard_svc.get_timeseries(
        db, project_id, from_timestamp, to_timestamp, granularity, metric
    )


@router.get("/models", response_model=ModelsResponse)
def dashboard_models(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
) -> ModelsResponse:
    """Model comparison stats: usage, cost, tokens per model."""
    return dashboard_svc.get_model_stats(db, project_id, from_timestamp, to_timestamp)


@router.get("/latency-distribution", response_model=LatencyDistributionResponse)
def dashboard_latency_distribution(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
) -> LatencyDistributionResponse:
    """Latency histogram: distribution of trace durations across buckets."""
    return dashboard_svc.get_latency_distribution(db, project_id, from_timestamp, to_timestamp)


@router.get("/top-traces", response_model=TopTracesResponse)
def dashboard_top_traces(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    order_by: str = Query(default="cost", regex="^(cost|latency|tokens)$"),
    limit: int = Query(default=10, ge=1, le=50),
    from_timestamp: Optional[datetime] = Query(default=None, alias="fromTimestamp"),
    to_timestamp: Optional[datetime] = Query(default=None, alias="toTimestamp"),
) -> TopTracesResponse:
    """Top traces ranked by cost, latency, or token usage."""
    return dashboard_svc.get_top_traces(db, project_id, order_by, limit, from_timestamp, to_timestamp)
