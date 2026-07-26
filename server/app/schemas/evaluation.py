"""Schemas for Evaluation APIs (M-Eval)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


# =============================================================================
# Evaluator
# =============================================================================

class EvaluatorCreate(BaseModel):
    name: str
    evaluator_type: str = "llm_judge"
    config: dict[str, Any]
    is_active: bool = True


class EvaluatorUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class EvaluatorResponse(BaseModel):
    id: str
    project_id: str
    name: str
    evaluator_type: str
    config: dict[str, Any]
    is_active: bool
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Evaluation Run
# =============================================================================

class EvaluationRunCreate(BaseModel):
    evaluator_id: str
    filters: Optional[dict[str, Any]] = None
    limit: int = 100


class EvaluationRunResponse(BaseModel):
    id: str
    project_id: str
    evaluator_id: str
    evaluator_name: Optional[str] = None  # joined from evaluator
    status: str
    filters: Optional[dict[str, Any]] = None
    total_traces: int = 0
    completed_traces: int = 0
    failed_traces: int = 0
    avg_score: Optional[float] = None
    score_distribution: Optional[dict[str, int]] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Evaluation Result
# =============================================================================

class EvaluationResultResponse(BaseModel):
    id: str
    run_id: str
    trace_id: str
    evaluator_id: str
    score_value: Optional[float] = None
    string_value: Optional[str] = None
    status: str
    reasoning: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class EvaluationResultDetail(EvaluationResultResponse):
    raw_response: Optional[dict[str, Any]] = None
    trace_name: Optional[str] = None
    trace_user_id: Optional[str] = None
    trace_timestamp: Optional[datetime] = None


class EvaluationRunDetail(EvaluationRunResponse):
    results: list[EvaluationResultDetail] = []
