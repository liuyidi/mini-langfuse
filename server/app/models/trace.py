"""Trace model."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


class Trace(Base):
    __tablename__ = "traces"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id"), nullable=False, index=True
    )
    name: Mapped[Optional[str]] = mapped_column(String)
    user_id: Mapped[Optional[str]] = mapped_column(String, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String, index=True)

    input: Mapped[Optional[Any]] = mapped_column(JSONType)
    output: Mapped[Optional[Any]] = mapped_column(JSONType)
    metadata_: Mapped[Optional[Any]] = mapped_column("metadata", JSONType)
    tags: Mapped[Optional[Any]] = mapped_column(JSONType)

    release: Mapped[Optional[str]] = mapped_column(String)
    version: Mapped[Optional[str]] = mapped_column(String)

    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Python-side default: SQLite has no working server DEFAULT (now()) after recreate.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


Index("idx_traces_project_time", Trace.project_id, Trace.timestamp.desc())
