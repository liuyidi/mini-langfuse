"""Schemas for Dataset APIs (M19)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


# =============================================================================
# Dataset
# =============================================================================

class DatasetCreate(BaseModel):
    name: str
    description: Optional[str] = None


class DatasetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class DatasetResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: Optional[str] = None
    item_count: int = 0
    created_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Dataset Item
# =============================================================================

class DatasetItemCreate(BaseModel):
    input: Optional[Any] = None
    expected_output: Optional[Any] = None
    metadata: Optional[Any] = None


class DatasetItemResponse(BaseModel):
    id: str
    dataset_id: str
    input: Optional[Any] = None
    expected_output: Optional[Any] = None
    metadata: Optional[Any] = None
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Dataset Run
# =============================================================================

class DatasetRunCreate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    evaluator_id: Optional[str] = None
    prompt_version_id: Optional[str] = None


class DatasetRunResponse(BaseModel):
    id: str
    project_id: str
    dataset_id: str
    dataset_name: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    status: str
    total_items: int = 0
    completed_items: int = 0
    failed_items: int = 0
    avg_score: Optional[float] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DatasetRunItemResponse(BaseModel):
    id: str
    run_id: str
    item_id: str
    output: Optional[Any] = None
    score_value: Optional[float] = None
    score_reasoning: Optional[str] = None
    trace_id: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DatasetRunDetail(DatasetRunResponse):
    items: list[DatasetRunItemResponse] = []
