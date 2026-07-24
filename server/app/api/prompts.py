"""Prompts API.

- POST /prompts               → create prompt or new version (auto-incrementing)
- GET  /prompts               → list prompts with latest version metadata
- GET  /prompts/{name}        → detail with all versions
- GET  /prompts/{name}/resolve?version=|label=production → single version
                                (label wins if both given)
- PATCH /prompt-versions/{id}/labels → move labels; ensures uniqueness of each label
"""
from __future__ import annotations

import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..models import Prompt, PromptVersion
from ..schemas.prompt import (
    PromptCreate,
    PromptDetail,
    PromptLabelUpdate,
    PromptListResponse,
    PromptOut,
    PromptVersionOut,
)

router = APIRouter(prefix="/api/public", tags=["prompts"])


def _new_id(prefix: str) -> str:
    return f"{prefix}{int(time.time()*1000):012x}{secrets.token_hex(6)}"


def _version_out(v: PromptVersion) -> PromptVersionOut:
    return PromptVersionOut(
        id=v.id,
        prompt_id=v.prompt_id,
        version=v.version,
        type=v.type,
        content=v.content,
        config=v.config,
        labels=v.labels,
        commit_msg=v.commit_msg,
        created_by=v.created_by,
        created_at=v.created_at,
    )


def _get_or_create_prompt(db: Session, project_id: str, name: str) -> Prompt:
    p = db.scalar(
        select(Prompt).where(Prompt.project_id == project_id, Prompt.name == name)
    )
    if p is not None:
        return p
    p = Prompt(id=_new_id("prompt_"), project_id=project_id, name=name)
    db.add(p)
    db.flush()  # ensure p.id is available
    return p


def _reassign_labels(db: Session, prompt_id: str, target_version_id: str, labels: list[str]) -> None:
    """Ensure each label points to exactly one version of this prompt."""
    if not labels:
        return
    versions = db.scalars(
        select(PromptVersion).where(PromptVersion.prompt_id == prompt_id)
    ).all()
    for v in versions:
        current = list(v.labels or [])
        if v.id == target_version_id:
            for lb in labels:
                if lb not in current:
                    current.append(lb)
        else:
            current = [lb for lb in current if lb not in labels]
        v.labels = current


@router.post("/prompts", response_model=PromptVersionOut)
def create_prompt(
    payload: PromptCreate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> PromptVersionOut:
    prompt = _get_or_create_prompt(db, project_id, payload.name)

    # Next version number
    latest = db.scalar(
        select(sqlfunc.max(PromptVersion.version)).where(
            PromptVersion.prompt_id == prompt.id
        )
    )
    next_version = (latest or 0) + 1

    pv = PromptVersion(
        id=_new_id("pv_"),
        prompt_id=prompt.id,
        version=next_version,
        type=payload.type,
        content=payload.content,
        config=payload.config,
        labels=payload.labels or [],
        commit_msg=payload.commit_msg,
        created_by=payload.created_by,
    )
    db.add(pv)
    db.flush()

    # If caller passed labels, ensure uniqueness across versions
    _reassign_labels(db, prompt.id, pv.id, payload.labels or [])

    db.commit()
    db.refresh(pv)
    return _version_out(pv)


def _latest(db: Session, prompt_id: str) -> Optional[PromptVersion]:
    return db.scalar(
        select(PromptVersion)
        .where(PromptVersion.prompt_id == prompt_id)
        .order_by(PromptVersion.version.desc())
        .limit(1)
    )


@router.get("/prompts", response_model=PromptListResponse)
def list_prompts(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> PromptListResponse:
    prompts = db.scalars(
        select(Prompt).where(Prompt.project_id == project_id).order_by(Prompt.created_at.desc())
    ).all()
    out: list[PromptOut] = []
    for p in prompts:
        latest = _latest(db, p.id)
        out.append(
            PromptOut(
                id=p.id,
                name=p.name,
                latest_version=latest.version if latest else None,
                latest_labels=latest.labels if latest else None,
                created_at=p.created_at,
            )
        )
    return PromptListResponse(data=out, total=len(out))


@router.get("/prompts/{name}", response_model=PromptDetail)
def get_prompt(
    name: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> PromptDetail:
    p = db.scalar(
        select(Prompt).where(Prompt.project_id == project_id, Prompt.name == name)
    )
    if p is None:
        raise HTTPException(status_code=404, detail="Prompt not found")
    versions = db.scalars(
        select(PromptVersion)
        .where(PromptVersion.prompt_id == p.id)
        .order_by(PromptVersion.version.desc())
    ).all()
    latest = versions[0] if versions else None
    return PromptDetail(
        id=p.id,
        name=p.name,
        latest_version=latest.version if latest else None,
        latest_labels=latest.labels if latest else None,
        created_at=p.created_at,
        versions=[_version_out(v) for v in versions],
    )


@router.get("/prompts/{name}/resolve", response_model=PromptVersionOut)
def resolve_prompt(
    name: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    version: Optional[int] = Query(default=None),
    label: Optional[str] = Query(default=None),
) -> PromptVersionOut:
    """Fetch a single version. Priority: explicit version > label > latest."""
    p = db.scalar(
        select(Prompt).where(Prompt.project_id == project_id, Prompt.name == name)
    )
    if p is None:
        raise HTTPException(status_code=404, detail="Prompt not found")

    if version is not None:
        v = db.scalar(
            select(PromptVersion).where(
                PromptVersion.prompt_id == p.id, PromptVersion.version == version
            )
        )
    elif label is not None:
        # SQLite JSON has no clean contains; scan and match in Python
        versions = db.scalars(
            select(PromptVersion).where(PromptVersion.prompt_id == p.id)
        ).all()
        v = next((x for x in versions if label in (x.labels or [])), None)
    else:
        v = _latest(db, p.id)

    if v is None:
        raise HTTPException(status_code=404, detail="Prompt version not found")
    return _version_out(v)


@router.patch("/prompt-versions/{version_id}/labels", response_model=PromptVersionOut)
def update_labels(
    version_id: str,
    payload: PromptLabelUpdate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> PromptVersionOut:
    pv = db.get(PromptVersion, version_id)
    if pv is None:
        raise HTTPException(status_code=404, detail="Prompt version not found")
    # verify project ownership
    parent = db.get(Prompt, pv.prompt_id)
    if parent is None or parent.project_id != project_id:
        raise HTTPException(status_code=404, detail="Prompt version not found")

    _reassign_labels(db, pv.prompt_id, pv.id, payload.labels)
    db.commit()
    db.refresh(pv)
    return _version_out(pv)
