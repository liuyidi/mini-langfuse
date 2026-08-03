"""Result mappers and tree helpers for ClickHouse rows."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any


def json_or_none(value: Any) -> Any:
    if value in (None, ""):
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return value


def parse_dt(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    text = str(value)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def normalize_trace_row(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    data["input"] = json_or_none(data.get("input"))
    data["output"] = json_or_none(data.get("output"))
    data["metadata"] = json_or_none(data.get("metadata"))
    data["tags"] = json_or_none(data.get("tags")) or []
    data["timestamp"] = parse_dt(data.get("timestamp")) or datetime.now(timezone.utc)
    data["created_at"] = parse_dt(data.get("created_at")) or data["timestamp"]
    data["duration_ms"] = data.get("duration_ms")
    data["total_tokens"] = data.get("total_tokens")
    data["total_cost_usd"] = data.get("total_cost_usd")
    data["observation_count"] = data.get("observation_count", 0)
    return data


def normalize_observation_row(row: dict[str, Any]) -> dict[str, Any]:
    data = dict(row)
    data["parent_observation_id"] = data.get("parent_observation_id")
    data["start_time"] = parse_dt(data.get("start_time")) or datetime.now(timezone.utc)
    data["end_time"] = parse_dt(data.get("end_time"))
    data["input"] = json_or_none(data.get("input"))
    data["output"] = json_or_none(data.get("output"))
    data["metadata"] = json_or_none(data.get("metadata"))
    data["model_parameters"] = json_or_none(data.get("model_parameters"))
    data["prompt_version_id"] = data.get("prompt_version_id")
    return data


def build_tree_from_rows(observations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    nodes: dict[str, dict[str, Any]] = {}
    roots: list[dict[str, Any]] = []
    for obs in observations:
        nodes[obs["id"]] = {**obs, "children": []}
    for obs in observations:
        node = nodes[obs["id"]]
        parent_id = obs.get("parent_observation_id")
        if parent_id and parent_id in nodes:
            nodes[parent_id]["children"].append(node)
        else:
            roots.append(node)

    def sort_recursive(items: list[dict[str, Any]]) -> None:
        items.sort(key=lambda n: (n["start_time"] is None, n["start_time"]))
        for item in items:
            sort_recursive(item["children"])

    sort_recursive(roots)
    return roots


def aggregate_metrics_from_rows(observations: list[dict[str, Any]]) -> dict[str, Any]:
    if not observations:
        return {
            "duration_ms": None,
            "total_tokens": None,
            "total_cost_usd": None,
            "observation_count": 0,
        }
    starts = [o["start_time"] for o in observations if o.get("start_time")]
    ends = [o["end_time"] for o in observations if o.get("end_time")]
    duration_ms: float | None = None
    if starts and ends:
        duration_ms = (max(ends) - min(starts)).total_seconds() * 1000.0
    total_tokens = sum((o.get("total_tokens") or 0) for o in observations) or None
    total_cost = sum((o.get("total_cost_usd") or 0.0) for o in observations) or None
    return {
        "duration_ms": duration_ms,
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost,
        "observation_count": len(observations),
    }

