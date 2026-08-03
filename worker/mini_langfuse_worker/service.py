"""Worker processing pipeline."""
from __future__ import annotations

from datetime import datetime, timezone
import json
import logging
from typing import Any

from .clickhouse import ClickHouseSink
from .schemas import IngestionJob, QueueEvent


LOG = logging.getLogger("mini_langfuse_worker")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_value(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _event_time(event: QueueEvent) -> str:
    if event.timestamp is not None:
        return event.timestamp.isoformat()
    return _now_iso()


def _trace_row(job: IngestionJob, event: QueueEvent) -> dict[str, Any]:
    body = event.body
    return {
        "event_id": event.id,
        "project_id": job.project_id,
        "trace_id": str(body.get("id", "")),
        "name": body.get("name"),
        "user_id": body.get("userId"),
        "session_id": body.get("sessionId"),
        "input": _json_value(body.get("input")),
        "output": _json_value(body.get("output")),
        "metadata": _json_value(body.get("metadata")),
        "tags": body.get("tags") or [],
        "release": body.get("release"),
        "version": body.get("version"),
        "event_timestamp": _event_time(event),
        "ingested_at": _now_iso(),
    }


def _observation_row(job: IngestionJob, event: QueueEvent, obs_type: str) -> dict[str, Any]:
    body = event.body
    usage = body.get("usage") or {}
    prompt_tokens = usage.get("prompt_tokens") or usage.get("input")
    completion_tokens = usage.get("completion_tokens") or usage.get("output")
    total_tokens = usage.get("total_tokens") or usage.get("total")
    if total_tokens is None and (prompt_tokens is not None or completion_tokens is not None):
        total_tokens = (prompt_tokens or 0) + (completion_tokens or 0)

    return {
        "event_id": event.id,
        "project_id": job.project_id,
        "observation_id": str(body.get("id", "")),
        "trace_id": body.get("traceId"),
        "parent_observation_id": body.get("parentObservationId"),
        "type": obs_type,
        "name": body.get("name"),
        "start_time": body.get("startTime") or _event_time(event),
        "end_time": body.get("endTime"),
        "status": body.get("status") or "OK",
        "status_message": body.get("statusMessage"),
        "level": body.get("level") or "DEFAULT",
        "input": _json_value(body.get("input")),
        "output": _json_value(body.get("output")),
        "metadata": _json_value(body.get("metadata")),
        "model": body.get("model"),
        "model_parameters": _json_value(body.get("modelParameters")),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "input_cost_usd": None,
        "output_cost_usd": None,
        "total_cost_usd": None,
        "prompt_version_id": body.get("promptVersionId"),
        "event_timestamp": _event_time(event),
        "ingested_at": _now_iso(),
    }


class WorkerService:
    def __init__(self, sink: ClickHouseSink) -> None:
        self.sink = sink

    def process_job(self, job: IngestionJob) -> None:
        trace_rows: list[dict[str, Any]] = []
        observation_rows: list[dict[str, Any]] = []

        for event in job.events:
            if event.type == "trace-create":
                trace_rows.append(_trace_row(job, event))
            elif event.type in {"span-create", "span-update"}:
                observation_rows.append(_observation_row(job, event, "SPAN"))
            elif event.type in {"generation-create", "generation-update"}:
                observation_rows.append(_observation_row(job, event, "GENERATION"))
            elif event.type == "event-create":
                observation_rows.append(_observation_row(job, event, "EVENT"))
            else:
                raise ValueError(f"Unsupported event type: {event.type}")

        if trace_rows:
            self.sink.insert_json_each_row("traces", trace_rows)
        if observation_rows:
            self.sink.insert_json_each_row("observations", observation_rows)

        LOG.info(
            "job processed job_id=%s project_id=%s events=%s traces=%s observations=%s",
            job.job_id,
            job.project_id,
            len(job.events),
            len(trace_rows),
            len(observation_rows),
        )
