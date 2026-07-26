"""DatasetItem model - a single test case in a dataset (M19)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base
from ..types import JSONType


class DatasetItem(Base):
    """A single test case: input, expected output, and metadata."""
    __tablename__ = "dataset_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    dataset_id: Mapped[str] = mapped_column(
        String, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    input: Mapped[Optional[Any]] = mapped_column(JSONType)
    expected_output: Mapped[Optional[Any]] = mapped_column(JSONType)
    metadata_: Mapped[Optional[Any]] = mapped_column("metadata", JSONType)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
