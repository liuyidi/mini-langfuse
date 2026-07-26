"""Evaluator model - defines how to automatically score traces (M-Eval)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


class Evaluator(Base):
    """An evaluator definition.

    Types:
    - llm_judge: Uses an LLM to score traces based on a prompt template
    - custom: Runs a custom Python function (future)

    For llm_judge, config contains:
    {
      "model": "gpt-4o-mini",
      "provider": "openai",
      "prompt_template": "Rate the following conversation from 1-5...",
      "score_type": "NUMERIC",  # NUMERIC | CATEGORICAL | BOOLEAN
      "score_min": 1,
      "score_max": 5,
      "temperature": 0.0,
    }
    """
    __tablename__ = "evaluators"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    evaluator_type: Mapped[str] = mapped_column(String, nullable=False)  # llm_judge | custom
    config: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
