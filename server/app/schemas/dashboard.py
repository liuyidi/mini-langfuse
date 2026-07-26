"""Schemas for Dashboard aggregation APIs (M11)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# =============================================================================
# Summary (KPI cards)
# =============================================================================

class PeriodRange(BaseModel):
    from_ts: datetime
    to_ts: datetime


class SummaryResponse(BaseModel):
    period: PeriodRange
    total_traces: int = 0
    total_observations: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    avg_latency_ms: Optional[float] = None
    p50_latency_ms: Optional[float] = None
    p95_latency_ms: Optional[float] = None
    p99_latency_ms: Optional[float] = None


# =============================================================================
# Timeseries
# =============================================================================

class TimeseriesBucket(BaseModel):
    timestamp: datetime
    value: float = 0.0
    count: int = 0


class TimeseriesResponse(BaseModel):
    granularity: str  # "1h" | "6h" | "1d" | "7d"
    metric: str  # "cost" | "tokens" | "traces" | "latency"
    buckets: list[TimeseriesBucket] = []


# =============================================================================
# Model comparison
# =============================================================================

class ModelStats(BaseModel):
    model: str
    total_observations: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    avg_latency_ms: Optional[float] = None
    avg_prompt_tokens: Optional[float] = None
    avg_completion_tokens: Optional[float] = None


class ModelsResponse(BaseModel):
    period: PeriodRange
    models: list[ModelStats] = []


# =============================================================================
# Latency distribution (histogram)
# =============================================================================

class HistogramBucket(BaseModel):
    bucket: str  # e.g. "0-100ms"
    count: int = 0


class LatencyDistributionResponse(BaseModel):
    period: PeriodRange
    histogram: list[HistogramBucket] = []


# =============================================================================
# Top traces
# =============================================================================

class TopTraceItem(BaseModel):
    id: str
    name: Optional[str] = None
    cost_usd: float = 0.0
    latency_ms: Optional[float] = None
    tokens: int = 0
    timestamp: datetime


class TopTracesResponse(BaseModel):
    order_by: str  # "cost" | "latency" | "tokens"
    traces: list[TopTraceItem] = []
