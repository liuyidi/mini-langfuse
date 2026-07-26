"""Web session model - browser session cookies for UI authentication (M6)."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class WebSession(Base):
    """Browser session for UI authentication via HttpOnly cookie."""
    __tablename__ = "sessions_web"

    token: Mapped[str] = mapped_column(String, primary_key=True)  # cookie value
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
