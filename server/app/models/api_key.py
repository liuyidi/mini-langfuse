"""API Key model - authentication keys for SDK access (M6)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class ApiKey(Base):
    """API key pair for project authentication.

    The public key is stored in plaintext.
    The secret is hashed with bcrypt and shown only once at creation.
    """
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(
        String, ForeignKey("projects.id"), nullable=False, index=True
    )
    public_key: Mapped[str] = mapped_column(
        String, unique=True, nullable=False, index=True
    )  # pk-lf-xxxxx
    secret_hash: Mapped[str] = mapped_column(String, nullable=False)  # bcrypt(secret)
    note: Mapped[Optional[str]] = mapped_column(String)  # user-provided description
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[Optional[str]] = mapped_column(String)  # user who created this key
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
