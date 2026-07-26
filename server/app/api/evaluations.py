"""Evaluation APIs - create and manage evaluators + evaluation runs (M-Eval)."""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import SessionLocal, get_db
from ..models import EvaluationResult, EvaluationRun, Evaluator, Trace
from ..schemas.evaluation import (
    EvaluationResultDetail,
    EvaluationResultResponse,
    EvaluationRunCreate,
    EvaluationRunDetail,
    EvaluationRunResponse,
    EvaluatorCreate,
    EvaluatorResponse,
    EvaluatorUpdate,
)
from ..services.evaluation import start_evaluation_async

router = APIRouter(prefix="/api/public", tags=["evaluations"])


# =============================================================================
# Evaluators CRUD
# =============================================================================

@router.get("/evaluators", response_model=list[EvaluatorResponse])
def list_evaluators(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """List all evaluators for this project."""
    evaluators = db.execute(
        select(Evaluator)
        .where(Evaluator.project_id == project_id)
        .order_by(Evaluator.created_at.desc())
    ).scalars().all()
    return evaluators


@router.post("/evaluators", response_model=EvaluatorResponse, status_code=201)
def create_evaluator(
    req: EvaluatorCreate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Create a new evaluator.

    Example config for llm_judge:
    {
      "model": "gpt-4o-mini",
      "provider": "openai",
      "prompt_template": "Rate the following conversation from 1 to 5...",
      "score_min": 1,
      "score_max": 5,
      "temperature": 0.0
    }
    """
    evaluator = Evaluator(
        id=f"eval_{secrets.token_urlsafe(12)}",
        project_id=project_id,
        name=req.name,
        evaluator_type=req.evaluator_type,
        config=req.config,
        is_active=req.is_active,
    )
    db.add(evaluator)
    db.commit()
    db.refresh(evaluator)
    return evaluator


@router.get("/evaluators/{evaluator_id}", response_model=EvaluatorResponse)
def get_evaluator(
    evaluator_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Get a single evaluator by ID."""
    evaluator = db.get(Evaluator, evaluator_id)
    if not evaluator or evaluator.project_id != project_id:
        raise HTTPException(status_code=404, detail="Evaluator not found")
    return evaluator


@router.patch("/evaluators/{evaluator_id}", response_model=EvaluatorResponse)
def update_evaluator(
    evaluator_id: str,
    req: EvaluatorUpdate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Update an evaluator's config or name."""
    evaluator = db.get(Evaluator, evaluator_id)
    if not evaluator or evaluator.project_id != project_id:
        raise HTTPException(status_code=404, detail="Evaluator not found")

    if req.name is not None:
        evaluator.name = req.name
    if req.config is not None:
        evaluator.config = req.config
    if req.is_active is not None:
        evaluator.is_active = req.is_active

    db.commit()
    db.refresh(evaluator)
    return evaluator


@router.delete("/evaluators/{evaluator_id}")
def delete_evaluator(
    evaluator_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Delete an evaluator (does not delete associated runs/results)."""
    evaluator = db.get(Evaluator, evaluator_id)
    if not evaluator or evaluator.project_id != project_id:
        raise HTTPException(status_code=404, detail="Evaluator not found")

    db.delete(evaluator)
    db.commit()
    return {"ok": True}


# =============================================================================
# Evaluation Runs
# =============================================================================

@router.get("/evaluation-runs", response_model=list[EvaluationRunResponse])
def list_evaluation_runs(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    evaluator_id: Optional[str] = Query(default=None, alias="evaluatorId"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """List evaluation runs for this project."""
    conditions = [EvaluationRun.project_id == project_id]
    if evaluator_id:
        conditions.append(EvaluationRun.evaluator_id == evaluator_id)

    runs = db.execute(
        select(EvaluationRun)
        .where(*conditions)
        .order_by(EvaluationRun.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).scalars().all()

    # Enrich with evaluator name
    result = []
    for run in runs:
        evaluator = db.get(Evaluator, run.evaluator_id)
        resp = EvaluationRunResponse.model_validate(run)
        resp.evaluator_name = evaluator.name if evaluator else None
        result.append(resp)

    return result


@router.post("/evaluation-runs", response_model=EvaluationRunResponse, status_code=201)
def create_evaluation_run(
    req: EvaluationRunCreate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Create and start a new evaluation run.

    The run will evaluate traces matching the filters using the specified evaluator.
    Results are computed in a background thread.
    """
    # Validate evaluator exists
    evaluator = db.get(Evaluator, req.evaluator_id)
    if not evaluator or evaluator.project_id != project_id:
        raise HTTPException(status_code=404, detail="Evaluator not found")

    filters = req.filters or {}
    filters["limit"] = req.limit

    run = EvaluationRun(
        id=f"run_{secrets.token_urlsafe(12)}",
        project_id=project_id,
        evaluator_id=req.evaluator_id,
        status="pending",
        filters=filters,
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    # Start evaluation in background thread
    start_evaluation_async(run.id, SessionLocal)

    resp = EvaluationRunResponse.model_validate(run)
    resp.evaluator_name = evaluator.name
    return resp


@router.get("/evaluation-runs/{run_id}", response_model=EvaluationRunDetail)
def get_evaluation_run(
    run_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Get a single evaluation run with its results."""
    run = db.get(EvaluationRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    evaluator = db.get(Evaluator, run.evaluator_id)

    # Get results
    results = db.execute(
        select(EvaluationResult)
        .where(EvaluationResult.run_id == run_id)
        .order_by(EvaluationResult.created_at)
    ).scalars().all()

    # Enrich results with trace info
    enriched_results = []
    for r in results:
        trace = db.get(Trace, r.trace_id)
        detail = EvaluationResultDetail.model_validate(r)
        if trace:
            detail.trace_name = trace.name
            detail.trace_user_id = trace.user_id
            detail.trace_timestamp = trace.timestamp
        enriched_results.append(detail)

    resp = EvaluationRunDetail.model_validate(run)
    resp.evaluator_name = evaluator.name if evaluator else None
    resp.results = enriched_results
    return resp


@router.get("/evaluation-runs/{run_id}/results", response_model=list[EvaluationResultResponse])
def list_evaluation_results(
    run_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """List all results for an evaluation run."""
    run = db.get(EvaluationRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    results = db.execute(
        select(EvaluationResult)
        .where(EvaluationResult.run_id == run_id)
        .order_by(EvaluationResult.created_at)
    ).scalars().all()

    return results


@router.post("/evaluation-runs/{run_id}/cancel")
def cancel_evaluation_run(
    run_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Cancel a running evaluation."""
    run = db.get(EvaluationRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(status_code=404, detail="Evaluation run not found")

    if run.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel run in '{run.status}' state")

    run.status = "cancelled"
    db.commit()
    return {"ok": True}
