"""Dataset APIs - CRUD for datasets, items, and experiment runs (M19)."""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func as sqlfunc, select
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..models import Dataset, DatasetItem, DatasetRun, DatasetRunItem
from ..schemas.dataset import (
    DatasetCreate,
    DatasetItemCreate,
    DatasetItemResponse,
    DatasetResponse,
    DatasetRunCreate,
    DatasetRunDetail,
    DatasetRunItemResponse,
    DatasetRunResponse,
    DatasetUpdate,
)

router = APIRouter(prefix="/api/public", tags=["datasets"])


# =============================================================================
# Datasets CRUD
# =============================================================================

@router.get("/datasets", response_model=list[DatasetResponse])
def list_datasets(
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """List all datasets for this project with item counts."""
    datasets = db.execute(
        select(Dataset)
        .where(Dataset.project_id == project_id)
        .order_by(Dataset.created_at.desc())
    ).scalars().all()

    result = []
    for ds in datasets:
        count = db.scalar(
            select(sqlfunc.count(DatasetItem.id)).where(DatasetItem.dataset_id == ds.id)
        ) or 0
        resp = DatasetResponse.model_validate(ds)
        resp.item_count = int(count)
        result.append(resp)
    return result


@router.post("/datasets", response_model=DatasetResponse, status_code=201)
def create_dataset(
    req: DatasetCreate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Create a new dataset."""
    ds = Dataset(
        id=f"ds_{secrets.token_urlsafe(12)}",
        project_id=project_id,
        name=req.name,
        description=req.description,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return DatasetResponse.model_validate(ds)


@router.get("/datasets/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Get a single dataset with item count."""
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    count = db.scalar(
        select(sqlfunc.count(DatasetItem.id)).where(DatasetItem.dataset_id == ds.id)
    ) or 0
    resp = DatasetResponse.model_validate(ds)
    resp.item_count = int(count)
    return resp


@router.patch("/datasets/{dataset_id}", response_model=DatasetResponse)
def update_dataset(
    dataset_id: str,
    req: DatasetUpdate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Update a dataset's name or description."""
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    if req.name is not None:
        ds.name = req.name
    if req.description is not None:
        ds.description = req.description
    db.commit()
    db.refresh(ds)
    return DatasetResponse.model_validate(ds)


@router.delete("/datasets/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Delete a dataset and all its items (CASCADE)."""
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project_id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    db.delete(ds)
    db.commit()
    return {"ok": True}


# =============================================================================
# Dataset Items CRUD
# =============================================================================

@router.get("/datasets/{dataset_id}/items", response_model=list[DatasetItemResponse])
def list_dataset_items(
    dataset_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
    limit: int = Query(default=200, ge=1, le=1000),
):
    """List all items in a dataset."""
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    items = db.execute(
        select(DatasetItem)
        .where(DatasetItem.dataset_id == dataset_id)
        .order_by(DatasetItem.created_at)
        .limit(limit)
    ).scalars().all()
    return items


@router.post("/datasets/{dataset_id}/items", response_model=DatasetItemResponse, status_code=201)
def create_dataset_item(
    dataset_id: str,
    req: DatasetItemCreate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Add an item to a dataset."""
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    item = DatasetItem(
        id=f"dsi_{secrets.token_urlsafe(12)}",
        dataset_id=dataset_id,
        input=req.input,
        expected_output=req.expected_output,
        metadata_=req.metadata,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/datasets/{dataset_id}/items/{item_id}")
def delete_dataset_item(
    dataset_id: str,
    item_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Delete a dataset item."""
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    item = db.get(DatasetItem, item_id)
    if not item or item.dataset_id != dataset_id:
        raise HTTPException(status_code=404, detail="Item not found")

    db.delete(item)
    db.commit()
    return {"ok": True}


# =============================================================================
# Dataset Runs (Experiments)
# =============================================================================

@router.get("/datasets/{dataset_id}/runs", response_model=list[DatasetRunResponse])
def list_dataset_runs(
    dataset_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """List all experiment runs for a dataset."""
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    runs = db.execute(
        select(DatasetRun)
        .where(DatasetRun.dataset_id == dataset_id)
        .order_by(DatasetRun.created_at.desc())
    ).scalars().all()

    result = []
    for run in runs:
        resp = DatasetRunResponse.model_validate(run)
        resp.dataset_name = ds.name
        result.append(resp)
    return result


@router.post("/datasets/{dataset_id}/runs", response_model=DatasetRunResponse, status_code=201)
def create_dataset_run(
    dataset_id: str,
    req: DatasetRunCreate,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Create a new experiment run on a dataset.

    Note: For a full experiment, items are processed asynchronously.
    This creates the run record. Items are populated when processing starts.
    """
    ds = db.get(Dataset, dataset_id)
    if not ds or ds.project_id != project_id:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Count items
    item_count = db.scalar(
        select(sqlfunc.count(DatasetItem.id)).where(DatasetItem.dataset_id == dataset_id)
    ) or 0

    run = DatasetRun(
        id=f"dsr_{secrets.token_urlsafe(12)}",
        project_id=project_id,
        dataset_id=dataset_id,
        name=req.name or f"Run {ds.name}",
        description=req.description,
        evaluator_id=req.evaluator_id,
        prompt_version_id=req.prompt_version_id,
        status="pending",
        total_items=int(item_count),
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    resp = DatasetRunResponse.model_validate(run)
    resp.dataset_name = ds.name
    return resp


@router.get("/dataset-runs/{run_id}", response_model=DatasetRunDetail)
def get_dataset_run(
    run_id: str,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
):
    """Get a single experiment run with its results."""
    run = db.get(DatasetRun, run_id)
    if not run or run.project_id != project_id:
        raise HTTPException(status_code=404, detail="Run not found")

    ds = db.get(Dataset, run.dataset_id)
    items = db.execute(
        select(DatasetRunItem)
        .where(DatasetRunItem.run_id == run_id)
        .order_by(DatasetRunItem.created_at)
    ).scalars().all()

    resp = DatasetRunDetail.model_validate(run)
    resp.dataset_name = ds.name if ds else None
    resp.items = [DatasetRunItemResponse.model_validate(i) for i in items]
    return resp
