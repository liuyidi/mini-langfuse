"""Membership model - user-organization relationship with roles (M6)."""
from __future__ import annotations

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class Membership(Base):
    """A user's membership in an organization with a specific role."""
    __tablename__ = "memberships"

    user_id: Mapped[str] = mapped_column(
        String, primary_key=True, nullable=False
    )
    org_id: Mapped[str] = mapped_column(
        String, primary_key=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    # Roles: OWNER, ADMIN, MEMBER, VIEWER
