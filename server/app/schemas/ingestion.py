"""Schemas for the ingestion endpoint - the client sends a batch of events."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


# ---------- Bodies ----------
class TraceBody(BaseModel):
    id: str
    name: Optional[str] = None
    user_id: Optional[str] = Field(default=None, alias="userId")
    session_id: Optional[str] = Field(default=None, alias="sessionId")
    input: Optional[Any] = None
    output: Optional[Any] = None
    metadata: Optional[Any] = None
    tags: Optional[list[str]] = None
    release: Optional[str] = None
    version: Optional[str] = None
    timestamp: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class ObservationBody(BaseModel):
    id: str
    trace_id: str = Field(alias="traceId")
    parent_observation_id: Optional[str] = Field(default=None, alias="parentObservationId")
    name: Optional[str] = None
    start_time: Optional[datetime] = Field(default=None, alias="startTime")
    end_time: Optional[datetime] = Field(default=None, alias="endTime")
    status: Optional[str] = None
    status_message: Optional[str] = Field(default=None, alias="statusMessage")
    level: Optional[str] = None
    input: Optional[Any] = None
    output: Optional[Any] = None
    metadata: Optional[Any] = None

    # Generation-specific (ignored for SPAN/EVENT)
    model: Optional[str] = None
    model_parameters: Optional[Any] = Field(default=None, alias="modelParameters")
    usage: Optional[dict[str, Any]] = None  # {prompt_tokens, completion_tokens, total_tokens}

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


# ---------- Event envelope ----------
EventType = Literal[
    "trace-create",
    "span-create",
    "span-update",
    "generation-create",
    "generation-update",
    "event-create",
]


class IngestionEvent(BaseModel):
    id: str
    type: EventType
    timestamp: Optional[datetime] = None
    body: dict[str, Any]  # parsed to a Body class in the service layer


class IngestionRequest(BaseModel):
    batch: list[IngestionEvent]


class IngestionEventResult(BaseModel):
    id: str
    status: Literal["success", "error"]
    message: Optional[str] = None


class IngestionResponse(BaseModel):
    successes: list[IngestionEventResult]
    errors: list[IngestionEventResult]
