"""Prompt + PromptVersion models.

Prompt: identity (project_id, name)
PromptVersion: an immutable version snapshot. `labels` (e.g. ["production"])
is the mutable pointer used to pin production without redeploying code.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


class Prompt(Base):
    __tablename__ = "prompts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_prompts_project_name"),)


class PromptVersion(Base):
    __tablename__ = "prompt_versions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    prompt_id: Mapped[str] = mapped_column(
        String, ForeignKey("prompts.id"), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    # 'text' or 'chat'. Chat prompts store list of {role, content}.
    type: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[Any] = mapped_column(JSONType, nullable=False)
    config: Mapped[Optional[Any]] = mapped_column(JSONType)     # model hints, variables etc.
    labels: Mapped[Optional[Any]] = mapped_column(JSONType)     # ["production", "staging", ...]
    commit_msg: Mapped[Optional[str]] = mapped_column(String)
    created_by: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("prompt_id", "version", name="uq_prompt_versions"),)
