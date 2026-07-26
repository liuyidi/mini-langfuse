"""Score model - a numeric / categorical / boolean rating attached to a Trace
(and optionally a specific Observation) from HUMAN / API / EVAL sources."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class Score(Base):
    __tablename__ = "scores"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    trace_id: Mapped[str] = mapped_column(
        String, ForeignKey("traces.id"), nullable=False, index=True
    )
    observation_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("observations.id")
    )

    name: Mapped[str] = mapped_column(String, nullable=False)          # e.g. "helpfulness"
    data_type: Mapped[str] = mapped_column(String, nullable=False)      # NUMERIC / CATEGORICAL / BOOLEAN
    value: Mapped[Optional[float]] = mapped_column(Float)               # numeric or 0/1 for boolean
    string_value: Mapped[Optional[str]] = mapped_column(String)         # for CATEGORICAL

    source: Mapped[str] = mapped_column(String, nullable=False)         # HUMAN / API / EVAL
    comment: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


Index("idx_scores_project", Score.project_id, Score.created_at.desc())
