"""Session schemas.

A Session is an *aggregation view* over traces grouped by session_id — not a
separate table. Two endpoints:

- SessionSummary: one row per session_id, with aggregate metrics
- SessionDetail: header + the list of Traces (with aggregates) in the session
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from .trace import TraceOut


class SessionSummary(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    trace_count: int
    first_trace_at: datetime
    last_trace_at: datetime
    total_tokens: Optional[int] = None
    total_cost_usd: Optional[float] = None

    model_config = ConfigDict()


class SessionListResponse(BaseModel):
    data: list[SessionSummary]
    total: int
    page: int
    limit: int


class SessionDetail(SessionSummary):
    traces: list[TraceOut] = []
