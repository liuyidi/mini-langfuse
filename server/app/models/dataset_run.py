"""DatasetRun model - an experiment run over a dataset (M19)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


class DatasetRun(Base):
    """An experiment run: apply a prompt/evaluator to all items in a dataset."""
    __tablename__ = "dataset_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id"), nullable=False, index=True
    )
    dataset_id: Mapped[str] = mapped_column(
        String, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[Optional[str]] = mapped_column(String)
    description: Mapped[Optional[str]] = mapped_column(String)

    # Configuration
    evaluator_id: Mapped[Optional[str]] = mapped_column(String)
    prompt_version_id: Mapped[Optional[str]] = mapped_column(String)
    config: Mapped[Optional[dict]] = mapped_column(JSONType)

    # Status
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    # pending | running | completed | failed

    # Results
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    completed_items: Mapped[int] = mapped_column(Integer, default=0)
    failed_items: Mapped[int] = mapped_column(Integer, default=0)
    avg_score: Mapped[Optional[float]] = mapped_column(Float)

    error_message: Mapped[Optional[str]] = mapped_column(String)
    created_by: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
