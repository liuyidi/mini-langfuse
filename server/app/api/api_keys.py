"""API Keys management - create and revoke API keys for SDK access (M6)."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import ApiKey, Membership, Project, User
from ..services.auth import generate_api_key_pair
from .auth import get_current_user

router = APIRouter(prefix="/api/ui", tags=["api-keys"])


# =============================================================================
# Schemas
# =============================================================================

class ApiKeyCreateRequest(BaseModel):
    note: Optional[str] = None  # user description for this key


class ApiKeyCreateResponse(BaseModel):
    id: str
    public_key: str
    secret: str  # Only shown once at creation!
    note: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ApiKeyResponse(BaseModel):
    id: str
    public_key: str
    note: Optional[str]
    last_used_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/projects/{project_id}/api-keys", response_model=list[ApiKeyResponse])
def list_api_keys(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all API keys for a project (secret is never returned)."""
    _require_project_access(db, current_user.id, project_id, min_role="MEMBER")

    keys = db.execute(
        select(ApiKey).where(ApiKey.project_id == project_id)
    ).scalars().all()

    return keys


@router.post("/projects/{project_id}/api-keys", response_model=ApiKeyCreateResponse)
def create_api_key(
    project_id: str,
    req: ApiKeyCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new API key pair.

    WARNING: The secret is only shown ONCE in the response. Store it securely!
    """
    _require_project_access(db, current_user.id, project_id, min_role="ADMIN")

    public_key, secret, secret_hash = generate_api_key_pair()

    api_key = ApiKey(
        id=f"key_{public_key[6:18]}",  # Use part of public key as ID
        project_id=project_id,
        public_key=public_key,
        secret_hash=secret_hash,
        note=req.note,
        created_by=current_user.id,
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    return ApiKeyCreateResponse(
        id=api_key.id,
        public_key=api_key.public_key,
        secret=secret,  # Only time the secret is visible!
        note=api_key.note,
        created_at=api_key.created_at,
    )


@router.delete("/projects/{project_id}/api-keys/{key_id}")
def delete_api_key(
    project_id: str,
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke (delete) an API key."""
    _require_project_access(db, current_user.id, project_id, min_role="ADMIN")

    api_key = db.scalar(
        select(ApiKey).where(
            ApiKey.id == key_id,
            ApiKey.project_id == project_id,
        )
    )

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="API key not found",
        )

    db.delete(api_key)
    db.commit()

    return {"ok": True}


# =============================================================================
# Helpers
# =============================================================================

ROLE_HIERARCHY = {"VIEWER": 0, "MEMBER": 1, "ADMIN": 2, "OWNER": 3}


def _require_project_access(
    db: Session,
    user_id: str,
    project_id: str,
    min_role: str = "VIEWER",
) -> None:
    """Check that user has at least min_role access to the project's org."""
    # Get the project's org_id
    project = db.scalar(select(Project).where(Project.id == project_id))
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # No org_id means legacy/demo project - allow access for now
    if project.org_id is None:
        return

    # Get user's membership in the org
    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user_id,
            Membership.org_id == project.org_id,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project",
        )

    user_level = ROLE_HIERARCHY.get(membership.role, 0)
    required_level = ROLE_HIERARCHY.get(min_role, 0)

    if user_level < required_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires {min_role} role or higher",
        )
