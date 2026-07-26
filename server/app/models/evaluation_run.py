"""EvaluationRun model - a batch evaluation run over traces (M-Eval)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EvaluationRun(Base):
    """A batch evaluation run that scores multiple traces using an evaluator.

    Status flow: pending → running → completed | failed | cancelled
    """
    __tablename__ = "evaluation_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id"), nullable=False, index=True
    )
    evaluator_id: Mapped[str] = mapped_column(
        String, ForeignKey("evaluators.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    # pending | running | completed | failed | cancelled

    # Configuration snapshot at run time
    filters: Mapped[Optional[dict]] = mapped_column(JSONType)
    # e.g. {"fromTimestamp": "...", "toTimestamp": "...", "name": "...", "tags": [...]}

    # Results summary (updated as run progresses)
    total_traces: Mapped[int] = mapped_column(Integer, default=0)
    completed_traces: Mapped[int] = mapped_column(Integer, default=0)
    failed_traces: Mapped[int] = mapped_column(Integer, default=0)
    avg_score: Mapped[Optional[float]] = mapped_column(Float)
    score_distribution: Mapped[Optional[dict]] = mapped_column(JSONType)

    error_message: Mapped[Optional[str]] = mapped_column(String)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        nullable=False,
    )
