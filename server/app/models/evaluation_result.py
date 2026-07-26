"""EvaluationResult model - individual score from an evaluation run (M-Eval)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EvaluationResult(Base):
    """A single evaluation result: one trace scored by one evaluator in one run."""
    __tablename__ = "evaluation_results"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String, ForeignKey("evaluation_runs.id"), nullable=False, index=True
    )
    trace_id: Mapped[str] = mapped_column(
        String, ForeignKey("traces.id"), nullable=False, index=True
    )
    evaluator_id: Mapped[str] = mapped_column(
        String, ForeignKey("evaluators.id"), nullable=False, index=True
    )

    # The actual score produced
    score_value: Mapped[Optional[float]] = mapped_column(Float)
    string_value: Mapped[Optional[str]] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    # pending | completed | failed

    # LLM reasoning / explanation
    reasoning: Mapped[Optional[str]] = mapped_column(String)

    # Raw LLM response for debugging
    raw_response: Mapped[Optional[dict]] = mapped_column(JSONType)

    error_message: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
    )
