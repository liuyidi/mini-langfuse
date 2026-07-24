"""Playground API - proxy an LLM call and record it as a trace."""
from __future__ import annotations

import secrets
import time
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import require_project
from ..db import get_db
from ..models import Observation, Trace
from ..services.cost import compute_cost
from ..services.llm_proxy import LLMError, call

router = APIRouter(prefix="/api/public/playground", tags=["playground"])


def _new_id(prefix: str) -> str:
    return f"{prefix}{int(time.time()*1000):012x}{secrets.token_hex(6)}"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PlaygroundRunRequest(BaseModel):
    provider: str = "mock"
    model: str
    messages: list[dict[str, Any]]
    params: dict[str, Any] = Field(default_factory=dict)
    # Optional trace metadata for grouping
    prompt_name: Optional[str] = Field(default=None, alias="promptName")
    prompt_version_id: Optional[str] = Field(default=None, alias="promptVersionId")
    variables: Optional[dict[str, Any]] = None  # for display / metadata only

    class Config:
        populate_by_name = True


class PlaygroundRunResponse(BaseModel):
    content: str
    usage: dict[str, Optional[int]]
    latency_ms: float
    input_cost_usd: Optional[float] = None
    output_cost_usd: Optional[float] = None
    total_cost_usd: Optional[float] = None
    trace_id: str
    observation_id: str


@router.post("/run", response_model=PlaygroundRunResponse)
def run(
    req: PlaygroundRunRequest,
    project_id: str = Depends(require_project),
    db: Session = Depends(get_db),
) -> PlaygroundRunResponse:
    # 1. Call the provider
    try:
        result = call(req.provider, req.model, req.messages, req.params)
    except LLMError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Provider call failed: {exc}")

    usage = result["usage"]
    prompt_tokens = usage.get("prompt_tokens")
    completion_tokens = usage.get("completion_tokens")
    total_tokens = usage.get("total_tokens")
    input_cost, output_cost, total_cost = compute_cost(
        req.model, prompt_tokens, completion_tokens
    )

    # 2. Persist as a trace + generation so the run shows up in Traces / Sessions
    now = _utcnow()
    trace_id = _new_id("trace_pg_")
    obs_id = _new_id("obs_pg_")
    trace_name = f"playground:{req.prompt_name}" if req.prompt_name else f"playground:{req.model}"

    trace = Trace(
        id=trace_id,
        project_id=project_id,
        name=trace_name,
        session_id=None,
        input={"messages": req.messages, "variables": req.variables or {}},
        output={"content": result["content"]},
        metadata_={"source": "playground", "provider": req.provider},
        tags=["playground"],
        timestamp=now,
    )
    db.add(trace)

    obs = Observation(
        id=obs_id,
        trace_id=trace_id,
        parent_observation_id=None,
        type="GENERATION",
        name=f"playground:{req.model}",
        start_time=now,
        end_time=now,
        status="OK",
        level="DEFAULT",
        input={"messages": req.messages},
        output={"content": result["content"]},
        metadata_={"provider": req.provider, "variables": req.variables or {}},
        model=req.model,
        model_parameters=req.params,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        total_tokens=total_tokens,
        input_cost_usd=input_cost,
        output_cost_usd=output_cost,
        total_cost_usd=total_cost,
        prompt_version_id=req.prompt_version_id,
    )
    db.add(obs)
    db.commit()

    return PlaygroundRunResponse(
        content=result["content"],
        usage={
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        },
        latency_ms=float(result["latency_ms"]),
        input_cost_usd=input_cost,
        output_cost_usd=output_cost,
        total_cost_usd=total_cost,
        trace_id=trace_id,
        observation_id=obs_id,
    )
