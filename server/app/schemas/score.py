"""Score request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


ScoreDataType = Literal["NUMERIC", "CATEGORICAL", "BOOLEAN"]
ScoreSource = Literal["HUMAN", "API", "EVAL"]


class ScoreCreate(BaseModel):
    id: Optional[str] = None
    trace_id: str = Field(alias="traceId")
    observation_id: Optional[str] = Field(default=None, alias="observationId")
    name: str
    data_type: ScoreDataType = Field(default="NUMERIC", alias="dataType")
    value: Optional[float] = None
    string_value: Optional[str] = Field(default=None, alias="stringValue")
    source: ScoreSource = "API"
    comment: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @model_validator(mode="after")
    def _check_value(self) -> "ScoreCreate":
        if self.data_type == "CATEGORICAL":
            if self.string_value is None:
                raise ValueError("string_value is required for CATEGORICAL scores")
        else:
            if self.value is None:
                raise ValueError("value is required for NUMERIC/BOOLEAN scores")
        return self


class ScoreUpdate(BaseModel):
    """Partial update for scores (annotation corrections)."""
    name: Optional[str] = None
    data_type: Optional[ScoreDataType] = Field(default=None, alias="dataType")
    value: Optional[float] = None
    string_value: Optional[str] = Field(default=None, alias="stringValue")
    comment: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class ScoreOut(BaseModel):
    id: str
    trace_id: str
    observation_id: Optional[str] = None
    name: str
    data_type: str
    value: Optional[float] = None
    string_value: Optional[str] = None
    source: str
    comment: Optional[str] = None
    created_at: datetime


class ScoreListResponse(BaseModel):
    data: list[ScoreOut]
    total: int
