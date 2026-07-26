"""Auth API - registration, login, logout, current user (M6)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Membership, Organization, Project, User
from ..services.auth import (
    authenticate_user,
    create_session,
    create_user,
    delete_session,
    get_user_by_email,
    validate_session,
)

router = APIRouter(prefix="/api/ui", tags=["auth"])


# =============================================================================
# Request/Response Schemas
# =============================================================================

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]

    class Config:
        from_attributes = True


class OrganizationResponse(BaseModel):
    id: str
    name: str
    role: str  # user's role in this org


class ProjectResponse(BaseModel):
    id: str
    name: str
    org_id: Optional[str]


class MeResponse(BaseModel):
    user: UserResponse
    organizations: list[OrganizationResponse]
    projects: list[ProjectResponse]


# =============================================================================
# Dependencies
# =============================================================================

def get_current_user(
    response: Response,
    mlf_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
) -> User:
    """Get the currently authenticated user from session cookie."""
    if mlf_session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    user = validate_session(db, mlf_session)
    if user is None:
        # Clear invalid cookie
        response.delete_cookie("mlf_session")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )

    return user


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/auth/register", response_model=MeResponse)
def register(req: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    """Register a new user.

    First user auto-creates an org and default project.
    """
    # Check if email already exists
    if get_user_by_email(db, req.email) is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Create user
    user = create_user(db, email=req.email, password=req.password, name=req.name)

    # First user gets a default org + project
    org_count = db.scalar(select(Organization)) or 0
    if org_count == 0:
        now = datetime.now(timezone.utc)
        # Create default org
        org = Organization(
            id=f"org_{user.id}",
            name=f"{req.name or req.email}'s Organization",
            created_at=now,
        )
        db.add(org)

        # Create membership as OWNER
        membership = Membership(user_id=user.id, org_id=org.id, role="OWNER")
        db.add(membership)

        # Create default project
        project = Project(
            id=f"proj_{user.id[:8]}",
            name="default",
            org_id=org.id,
            created_at=now,
        )
        db.add(project)
        db.commit()

    # Create session
    session = create_session(db, user.id)
    response.set_cookie(
        key="mlf_session",
        value=session.token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,  # 1 week
    )

    return _build_me_response(db, user)


@router.post("/auth/login", response_model=MeResponse)
def login(req: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """Login with email and password."""
    user = authenticate_user(db, req.email, req.password)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    # Create session
    session = create_session(db, user.id)
    response.set_cookie(
        key="mlf_session",
        value=session.token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,  # 1 week
    )

    return _build_me_response(db, user)


@router.post("/auth/logout")
def logout(
    response: Response,
    mlf_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
):
    """Logout - invalidate the session."""
    if mlf_session:
        delete_session(db, mlf_session)

    response.delete_cookie("mlf_session")
    return {"ok": True}


@router.get("/me", response_model=MeResponse)
def me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get current user info with their organizations and projects."""
    return _build_me_response(db, current_user)


# =============================================================================
# Helpers
# =============================================================================

def _build_me_response(db: Session, user: User) -> MeResponse:
    """Build the /me response with user's orgs and projects."""
    # Get user's organizations with roles
    memberships = db.execute(
        select(Membership).where(Membership.user_id == user.id)
    ).scalars().all()

    org_ids = [m.org_id for m in memberships]
    orgs = db.execute(
        select(Organization).where(Organization.id.in_(org_ids))
    ).scalars().all() if org_ids else []

    org_map = {o.id: o for o in orgs}
    role_map = {m.org_id: m.role for m in memberships}

    organizations = [
        OrganizationResponse(
            id=o.id,
            name=o.name,
            role=role_map[o.id],
        )
        for o in orgs
    ]

    # Get projects in user's orgs
    projects = db.execute(
        select(Project).where(Project.org_id.in_(org_ids))
    ).scalars().all() if org_ids else []

    project_list = [
        ProjectResponse(id=p.id, name=p.name, org_id=p.org_id)
        for p in projects
    ]

    return MeResponse(
        user=UserResponse(id=user.id, email=user.email, name=user.name),
        organizations=organizations,
        projects=project_list,
    )
