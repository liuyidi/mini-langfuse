"""Build an observation tree and aggregate trace metrics."""
from __future__ import annotations

from typing import Any

from ..models import Observation, Trace


def _obs_to_dict(obs: Observation) -> dict[str, Any]:
    return {
        "id": obs.id,
        "trace_id": obs.trace_id,
        "parent_observation_id": obs.parent_observation_id,
        "type": obs.type,
        "name": obs.name,
        "start_time": obs.start_time,
        "end_time": obs.end_time,
        "status": obs.status,
        "status_message": obs.status_message,
        "level": obs.level,
        "input": obs.input,
        "output": obs.output,
        "metadata": obs.metadata_,
        "model": obs.model,
        "model_parameters": obs.model_parameters,
        "prompt_tokens": obs.prompt_tokens,
        "completion_tokens": obs.completion_tokens,
        "total_tokens": obs.total_tokens,
        "input_cost_usd": obs.input_cost_usd,
        "output_cost_usd": obs.output_cost_usd,
        "total_cost_usd": obs.total_cost_usd,
        "children": [],
    }


def build_tree(observations: list[Observation]) -> list[dict[str, Any]]:
    """Turn a flat list into a forest ordered by start_time."""
    nodes: dict[str, dict[str, Any]] = {obs.id: _obs_to_dict(obs) for obs in observations}
    roots: list[dict[str, Any]] = []

    for obs in observations:
        node = nodes[obs.id]
        parent_id = obs.parent_observation_id
        if parent_id and parent_id in nodes:
            nodes[parent_id]["children"].append(node)
        else:
            roots.append(node)

    def sort_recursive(items: list[dict[str, Any]]) -> None:
        items.sort(key=lambda n: (n["start_time"] is None, n["start_time"]))
        for it in items:
            sort_recursive(it["children"])

    sort_recursive(roots)
    return roots


def aggregate_metrics(trace: Trace, observations: list[Observation]) -> dict[str, Any]:
    if not observations:
        return {
            "duration_ms": None,
            "total_tokens": None,
            "total_cost_usd": None,
            "observation_count": 0,
        }
    starts = [o.start_time for o in observations if o.start_time]
    ends = [o.end_time for o in observations if o.end_time]
    duration_ms: float | None = None
    if starts and ends:
        duration_ms = (max(ends) - min(starts)).total_seconds() * 1000.0

    total_tokens = sum((o.total_tokens or 0) for o in observations) or None
    total_cost = sum((o.total_cost_usd or 0.0) for o in observations) or None

    return {
        "duration_ms": duration_ms,
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost,
        "observation_count": len(observations),
    }


def trace_to_dict(trace: Trace) -> dict[str, Any]:
    return {
        "id": trace.id,
        "project_id": trace.project_id,
        "name": trace.name,
        "user_id": trace.user_id,
        "session_id": trace.session_id,
        "input": trace.input,
        "output": trace.output,
        "metadata": trace.metadata_,
        "tags": trace.tags,
        "release": trace.release,
        "version": trace.version,
        "timestamp": trace.timestamp,
        "created_at": trace.created_at,
    }
