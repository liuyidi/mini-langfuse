"""Core ingestion: dispatch events to upsert traces / observations."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ..models import Observation, Trace
from ..schemas.ingestion import (
    IngestionEvent,
    IngestionEventResult,
    IngestionResponse,
    ObservationBody,
    TraceBody,
)
from .cost import compute_cost
from .event_bus import bus


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _apply_updates(instance: Any, fields: dict[str, Any]) -> None:
    """Assign only non-None fields; skip keys we don't want to overwrite with None."""
    for key, value in fields.items():
        if value is None:
            continue
        setattr(instance, key, value)


def _handle_trace_create(db: Session, project_id: str, body: TraceBody) -> None:
    existing = db.get(Trace, body.id)
    ts = body.timestamp or _utcnow()
    if existing is None:
        trace = Trace(
            id=body.id,
            project_id=project_id,
            name=body.name,
            user_id=body.user_id,
            session_id=body.session_id,
            input=body.input,
            output=body.output,
            metadata_=body.metadata,
            tags=body.tags,
            release=body.release,
            version=body.version,
            timestamp=ts,
        )
        db.add(trace)
    else:
        # Upsert - allow later events to fill in missing fields / update outputs
        _apply_updates(
            existing,
            {
                "name": body.name,
                "user_id": body.user_id,
                "session_id": body.session_id,
                "input": body.input,
                "output": body.output,
                "metadata_": body.metadata,
                "tags": body.tags,
                "release": body.release,
                "version": body.version,
            },
        )


def _handle_observation(
    db: Session,
    body: ObservationBody,
    obs_type: str,
    is_create: bool,
) -> None:
    existing = db.get(Observation, body.id)
    usage = body.usage or {}
    prompt_tokens = usage.get("prompt_tokens") or usage.get("input")
    completion_tokens = usage.get("completion_tokens") or usage.get("output")
    total_tokens = usage.get("total_tokens") or usage.get("total")
    if total_tokens is None and (prompt_tokens is not None or completion_tokens is not None):
        total_tokens = (prompt_tokens or 0) + (completion_tokens or 0)

    # Compute cost for GENERATIONs whenever we know the model and any token count
    input_cost = output_cost = total_cost = None
    if obs_type == "GENERATION":
        model = body.model or (existing.model if existing else None)
        input_cost, output_cost, total_cost = compute_cost(
            model, prompt_tokens, completion_tokens
        )

    if existing is None:
        obs = Observation(
            id=body.id,
            trace_id=body.trace_id,
            parent_observation_id=body.parent_observation_id,
            type=obs_type,
            name=body.name,
            start_time=body.start_time or _utcnow(),
            end_time=body.end_time,
            status=body.status or "OK",
            status_message=body.status_message,
            level=body.level or "DEFAULT",
            input=body.input,
            output=body.output,
            metadata_=body.metadata,
            model=body.model,
            model_parameters=body.model_parameters,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=total_tokens,
            input_cost_usd=input_cost,
            output_cost_usd=output_cost,
            total_cost_usd=total_cost,
            prompt_version_id=body.prompt_version_id,
        )
        db.add(obs)
    else:
        _apply_updates(
            existing,
            {
                "parent_observation_id": body.parent_observation_id,
                "name": body.name,
                "end_time": body.end_time,
                "status": body.status,
                "status_message": body.status_message,
                "level": body.level,
                "input": body.input,
                "output": body.output,
                "metadata_": body.metadata,
                "model": body.model,
                "model_parameters": body.model_parameters,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": total_tokens,
                "input_cost_usd": input_cost,
                "output_cost_usd": output_cost,
                "total_cost_usd": total_cost,
                "prompt_version_id": body.prompt_version_id,
            },
        )
        # Only overwrite start_time on create
        if is_create and body.start_time is not None:
            existing.start_time = body.start_time


def process_batch(
    db: Session,
    project_id: str,
    events: list[IngestionEvent],
) -> IngestionResponse:
    successes: list[IngestionEventResult] = []
    errors: list[IngestionEventResult] = []

    for evt in events:
        # Use a savepoint so one bad event doesn't kill the whole batch
        sp = db.begin_nested()
        try:
            t = evt.type
            if t == "trace-create":
                body = TraceBody.model_validate(evt.body)
                _handle_trace_create(db, project_id, body)
            elif t in ("span-create", "span-update"):
                body = ObservationBody.model_validate(evt.body)
                _handle_observation(db, body, "SPAN", is_create=(t == "span-create"))
            elif t in ("generation-create", "generation-update"):
                body = ObservationBody.model_validate(evt.body)
                _handle_observation(db, body, "GENERATION", is_create=(t == "generation-create"))
            elif t == "event-create":
                body = ObservationBody.model_validate(evt.body)
                _handle_observation(db, body, "EVENT", is_create=True)
            else:
                raise ValueError(f"Unknown event type: {t}")
            sp.commit()
            successes.append(IngestionEventResult(id=evt.id, status="success"))
        except Exception as exc:  # noqa: BLE001
            sp.rollback()
            errors.append(
                IngestionEventResult(
                    id=evt.id, status="error", message=f"{type(exc).__name__}: {exc}"
                )
            )

    try:
        db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        errors.append(
            IngestionEventResult(id="__commit__", status="error", message=str(exc))
        )
        successes = []

    # Publish events for successful trace/observation upserts (M10)
    if successes:
        trace_ids = set()
        for evt in events:
            if evt.type == "trace-create":
                trace_ids.add(evt.body.get("id"))
            elif evt.type in ("span-create", "span-update", "generation-create", "generation-update", "event-create"):
                tid = evt.body.get("trace_id")
                if tid:
                    trace_ids.add(tid)

        for trace_id in trace_ids:
            bus.publish(project_id, "trace_upserted", {"trace_id": trace_id})

    return IngestionResponse(successes=successes, errors=errors)
