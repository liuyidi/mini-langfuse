"""Schemas for trace read APIs (response models)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ObservationOut(BaseModel):
    id: str
    trace_id: str
    parent_observation_id: Optional[str] = None
    type: str
    name: Optional[str] = None
    start_time: datetime
    end_time: Optional[datetime] = None
    status: Optional[str] = None
    status_message: Optional[str] = None
    level: Optional[str] = None
    input: Optional[Any] = None
    output: Optional[Any] = None
    metadata: Optional[Any] = None

    model: Optional[str] = None
    model_parameters: Optional[Any] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    total_tokens: Optional[int] = None
    input_cost_usd: Optional[float] = None
    output_cost_usd: Optional[float] = None
    total_cost_usd: Optional[float] = None

    model_config = ConfigDict()


class ObservationTreeNode(ObservationOut):
    children: list["ObservationTreeNode"] = []


class TraceOut(BaseModel):
    id: str
    project_id: str
    name: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    input: Optional[Any] = None
    output: Optional[Any] = None
    metadata: Optional[Any] = None
    tags: Optional[Any] = None
    release: Optional[str] = None
    version: Optional[str] = None
    timestamp: datetime
    created_at: datetime

    # Aggregates (computed on read for M1)
    duration_ms: Optional[float] = None
    total_tokens: Optional[int] = None
    total_cost_usd: Optional[float] = None
    observation_count: int = 0

    model_config = ConfigDict()


class TraceDetail(TraceOut):
    observations: list[ObservationTreeNode] = []


class TraceListResponse(BaseModel):
    data: list[TraceOut]
    total: int
    page: int
    limit: int


ObservationTreeNode.model_rebuild()
