"""Auth API - registration, login, logout, current user (M6)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Membership, Organization, Project, User, WebSession
from ..services.auth import (
    authenticate_user,
    create_session,
    create_user,
    delete_session,
    get_user_by_email,
    validate_session,
    hash_password,
    verify_password,
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


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    current_password: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class DeleteAccountRequest(BaseModel):
    current_password: str


class SessionResponse(BaseModel):
    token: str
    created_at: datetime
    expires_at: datetime
    is_current: bool


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


@router.patch("/account/profile", response_model=MeResponse)
def update_profile(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update the current user's profile information."""
    user = db.scalar(select(User).where(User.id == current_user.id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if req.email is not None:
        next_email = str(req.email).strip()
        if next_email != user.email:
            if not req.current_password:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is required to change your email",
                )
            if user.password_hash is None or not verify_password(req.current_password, user.password_hash):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Current password is incorrect",
                )
            existing = get_user_by_email(db, next_email)
            if existing is not None and existing.id != user.id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already registered",
                )
            user.email = next_email

    if req.name is not None:
        cleaned = req.name.strip()
        user.name = cleaned or None

    db.commit()
    db.refresh(user)
    return _build_me_response(db, user)


@router.post("/account/password")
def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the current user's password."""
    user = db.scalar(select(User).where(User.id == current_user.id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    if user.password_hash is None or not verify_password(req.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"ok": True}


@router.post("/account/delete")
def delete_account(
    req: DeleteAccountRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    mlf_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
):
    """Delete the current user account.

    This removes browser sessions and organization memberships, then deletes
    the user record itself. Project and trace data remain intact for now.
    """
    user = db.scalar(select(User).where(User.id == current_user.id))
    if user is None:
      raise HTTPException(
          status_code=status.HTTP_404_NOT_FOUND,
          detail="User not found",
      )
    if user.password_hash is None or not verify_password(req.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    db.query(WebSession).filter(WebSession.user_id == user.id).delete(synchronize_session=False)
    db.query(Membership).filter(Membership.user_id == user.id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()
    response.delete_cookie("mlf_session")
    return {"ok": True}


@router.get("/account/sessions", response_model=list[SessionResponse])
def list_sessions(
    current_user: User = Depends(get_current_user),
    mlf_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
):
    """List browser sessions for the current user."""
    sessions = db.execute(
        select(WebSession)
        .where(WebSession.user_id == current_user.id)
        .order_by(WebSession.created_at.desc())
    ).scalars().all()
    return [
        SessionResponse(
            token=session.token,
            created_at=session.created_at,
            expires_at=session.expires_at,
            is_current=session.token == mlf_session,
        )
        for session in sessions
    ]


@router.delete("/account/sessions/{session_token}")
def revoke_session(
    session_token: str,
    current_user: User = Depends(get_current_user),
    mlf_session: Optional[str] = Cookie(None),
    db: Session = Depends(get_db),
):
    """Revoke one browser session for the current user."""
    session = db.scalar(
        select(WebSession).where(
            WebSession.token == session_token,
            WebSession.user_id == current_user.id,
        )
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    db.delete(session)
    db.commit()
    return {"ok": True, "revoked_current": session_token == mlf_session}


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
