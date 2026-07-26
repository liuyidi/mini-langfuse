"""DatasetRunItem model - result of running one dataset item in an experiment (M19)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


class DatasetRunItem(Base):
    """Individual result: one dataset item processed in one run."""
    __tablename__ = "dataset_run_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(
        String, ForeignKey("dataset_runs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    item_id: Mapped[str] = mapped_column(
        String, ForeignKey("dataset_items.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Output from the experiment
    output: Mapped[Optional[Any]] = mapped_column(JSONType)

    # Score from evaluation
    score_value: Mapped[Optional[float]] = mapped_column(Float)
    score_reasoning: Mapped[Optional[str]] = mapped_column(String)

    # Linked trace (if the run created a trace)
    trace_id: Mapped[Optional[str]] = mapped_column(String)

    # Status
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    error_message: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
