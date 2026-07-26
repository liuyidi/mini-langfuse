"""Observation model - Span / Generation / Event as a single flat table."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


class Observation(Base):
    __tablename__ = "observations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    trace_id: Mapped[str] = mapped_column(
        String, ForeignKey("traces.id"), nullable=False, index=True
    )
    parent_observation_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("observations.id"), index=True
    )

    # SPAN | GENERATION | EVENT
    type: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[Optional[str]] = mapped_column(String)

    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    status: Mapped[Optional[str]] = mapped_column(String, default="OK")
    status_message: Mapped[Optional[str]] = mapped_column(String)
    level: Mapped[Optional[str]] = mapped_column(String, default="DEFAULT")

    input: Mapped[Optional[Any]] = mapped_column(JSONType)
    output: Mapped[Optional[Any]] = mapped_column(JSONType)
    metadata_: Mapped[Optional[Any]] = mapped_column("metadata", JSONType)

    # Generation-only fields (nullable for SPAN/EVENT)
    model: Mapped[Optional[str]] = mapped_column(String)
    model_parameters: Mapped[Optional[Any]] = mapped_column(JSONType)
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    total_tokens: Mapped[Optional[int]] = mapped_column(Integer)
    input_cost_usd: Mapped[Optional[float]] = mapped_column(Float)
    output_cost_usd: Mapped[Optional[float]] = mapped_column(Float)
    total_cost_usd: Mapped[Optional[float]] = mapped_column(Float)

    # Optional reference to the PromptVersion this generation used
    prompt_version_id: Mapped[Optional[str]] = mapped_column(String, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


Index("idx_obs_trace_start", Observation.trace_id, Observation.start_time)
