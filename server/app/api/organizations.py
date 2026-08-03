"""Organization API - organization overview and basic project management (M6/Phase 3)."""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Membership, Organization, Project, User
from .auth import get_current_user

router = APIRouter(prefix="/api/ui", tags=["organizations"])

ROLE_HIERARCHY = {"VIEWER": 0, "MEMBER": 1, "ADMIN": 2, "OWNER": 3}


class OrganizationUpdateRequest(BaseModel):
    name: str


class ProjectCreateRequest(BaseModel):
    name: str


class ProjectUpdateRequest(BaseModel):
    name: str


class MemberResponse(BaseModel):
    user_id: str
    email: str
    name: Optional[str]
    role: str


class ProjectResponse(BaseModel):
    id: str
    name: str
    org_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class OrganizationDetailResponse(BaseModel):
    id: str
    name: str
    role: str
    members: list[MemberResponse]
    projects: list[ProjectResponse]


class OrganizationUpdateResponse(BaseModel):
    id: str
    name: str


def _require_org_access(
    db: Session,
    user_id: str,
    org_id: str,
    min_role: str = "VIEWER",
) -> Membership:
    org = db.scalar(select(Organization).where(Organization.id == org_id))
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    membership = db.scalar(
        select(Membership).where(
            Membership.user_id == user_id,
            Membership.org_id == org_id,
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this organization",
        )

    user_level = ROLE_HIERARCHY.get(membership.role, 0)
    required_level = ROLE_HIERARCHY.get(min_role, 0)
    if user_level < required_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires {min_role} role or higher",
        )
    return membership


@router.get("/organizations/{org_id}", response_model=OrganizationDetailResponse)
def get_organization(
    org_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = _require_org_access(db, current_user.id, org_id, min_role="VIEWER")
    org = db.scalar(select(Organization).where(Organization.id == org_id))
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    members = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.org_id == org_id)
        .order_by(User.email.asc())
    ).all()

    projects = db.execute(
        select(Project)
        .where(Project.org_id == org_id)
        .order_by(Project.created_at.asc())
    ).scalars().all()

    return OrganizationDetailResponse(
        id=org.id,
        name=org.name,
        role=membership.role,
        members=[
            MemberResponse(
                user_id=user.id,
                email=user.email,
                name=user.name,
                role=row.role,
            )
            for row, user in members
        ],
        projects=projects,
    )


@router.patch("/organizations/{org_id}", response_model=OrganizationUpdateResponse)
def update_organization(
    org_id: str,
    req: OrganizationUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_org_access(db, current_user.id, org_id, min_role="ADMIN")
    org = db.scalar(select(Organization).where(Organization.id == org_id))
    if org is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )

    org.name = req.name.strip() or org.name
    db.commit()
    db.refresh(org)
    return OrganizationUpdateResponse(id=org.id, name=org.name)


@router.post("/organizations/{org_id}/projects", response_model=ProjectResponse)
def create_project(
    org_id: str,
    req: ProjectCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_org_access(db, current_user.id, org_id, min_role="ADMIN")
    name = req.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project name is required",
        )

    project = Project(
        id=f"proj_{secrets.token_urlsafe(8)}",
        name=name,
        org_id=org_id,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    req: ProjectUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = db.scalar(select(Project).where(Project.id == project_id))
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )
    if project.org_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Legacy demo projects cannot be renamed yet",
        )

    _require_org_access(db, current_user.id, project.org_id, min_role="ADMIN")

    next_name = req.name.strip()
    if not next_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project name is required",
        )
    project.name = next_name
    db.commit()
    db.refresh(project)
    return project
