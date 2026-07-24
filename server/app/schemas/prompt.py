"""Prompt request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


PromptType = Literal["text", "chat"]


class PromptVersionOut(BaseModel):
    id: str
    prompt_id: str
    version: int
    type: str
    content: Any
    config: Optional[Any] = None
    labels: Optional[list[str]] = None
    commit_msg: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime


class PromptOut(BaseModel):
    id: str
    name: str
    latest_version: Optional[int] = None
    latest_labels: Optional[list[str]] = None
    created_at: datetime


class PromptListResponse(BaseModel):
    data: list[PromptOut]
    total: int


class PromptDetail(PromptOut):
    versions: list[PromptVersionOut] = []


class PromptCreate(BaseModel):
    """Creates a new prompt or a new version of an existing prompt (by name)."""
    name: str
    type: PromptType = "text"
    content: Any
    config: Optional[Any] = None
    labels: Optional[list[str]] = None
    commit_msg: Optional[str] = Field(default=None, alias="commitMessage")
    created_by: Optional[str] = Field(default=None, alias="createdBy")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class PromptLabelUpdate(BaseModel):
    """Move labels among versions of the same prompt.

    Semantics: a label points to exactly one version at a time. Setting
    label='production' on v3 removes it from any older version that had it.
    """
    labels: list[str]
