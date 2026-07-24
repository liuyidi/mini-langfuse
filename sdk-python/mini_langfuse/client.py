"""Client + trace/span context managers.

Event flow:
  Client._enqueue()  →  Flusher._q  →  daemon thread batches  →  HTTP POST /ingestion

The main thread never blocks on network. Guarantees flush at interpreter exit
via atexit.
"""
from __future__ import annotations

import base64
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

import httpx

from . import context
from .flusher import Flusher, json_dumps
from .ids import new_id

log = logging.getLogger("mini_langfuse")


def _iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class _Span:
    """A running span. Call .update(...) or .end() to send updates."""

    def __init__(
        self,
        client: "Client",
        trace_id: str,
        span_id: str,
        obs_type: str,  # SPAN | GENERATION | EVENT
    ) -> None:
        self._client = client
        self._trace_id = trace_id
        self._id = span_id
        self._type = obs_type
        self._ended = False

    @property
    def id(self) -> str:
        return self._id

    @property
    def trace_id(self) -> str:
        return self._trace_id

    def update(self, **fields: Any) -> None:
        """Send an update event with arbitrary fields (input, output, metadata, model, usage...)."""
        body: dict[str, Any] = {"id": self._id, "traceId": self._trace_id}
        for k, v in fields.items():
            if k == "end_time" and isinstance(v, datetime):
                v = _iso(v)
            if k == "start_time" and isinstance(v, datetime):
                v = _iso(v)
            body[self._to_camel(k)] = v
        evt_type = {
            "SPAN": "span-update",
            "GENERATION": "generation-update",
            "EVENT": "event-create",
        }[self._type]
        self._client._enqueue(evt_type, body)

    def end(self, **fields: Any) -> None:
        if self._ended:
            return
        self._ended = True
        fields.setdefault("end_time", _utcnow())
        self.update(**fields)

    @staticmethod
    def _to_camel(name: str) -> str:
        # translate select snake fields the server expects in camel
        mapping = {
            "trace_id": "traceId",
            "parent_observation_id": "parentObservationId",
            "start_time": "startTime",
            "end_time": "endTime",
            "status_message": "statusMessage",
            "model_parameters": "modelParameters",
            "prompt_version_id": "promptVersionId",
        }
        return mapping.get(name, name)


class _Trace:
    """A running trace; also acts as a factory for its child spans."""

    def __init__(self, client: "Client", trace_id: str) -> None:
        self._client = client
        self._id = trace_id

    @property
    def id(self) -> str:
        return self._id

    def update(self, **fields: Any) -> None:
        body: dict[str, Any] = {"id": self._id}
        for k, v in fields.items():
            if k == "user_id":
                body["userId"] = v
            elif k == "session_id":
                body["sessionId"] = v
            elif k == "timestamp" and isinstance(v, datetime):
                body["timestamp"] = _iso(v)
            else:
                body[k] = v
        self._client._enqueue("trace-create", body)

    @contextmanager
    def span(
        self,
        name: Optional[str] = None,
        *,
        input: Any = None,
        metadata: Any = None,
    ) -> Iterator[_Span]:
        yield from self._open("SPAN", name=name, input=input, metadata=metadata)

    @contextmanager
    def generation(
        self,
        name: Optional[str] = None,
        *,
        model: Optional[str] = None,
        input: Any = None,
        model_parameters: Any = None,
        metadata: Any = None,
        prompt_version_id: Optional[str] = None,
    ) -> Iterator[_Span]:
        extra = {
            "model": model,
            "modelParameters": model_parameters,
            "promptVersionId": prompt_version_id,
        }
        yield from self._open(
            "GENERATION", name=name, input=input, metadata=metadata, extra=extra
        )

    def _open(
        self,
        obs_type: str,
        *,
        name: Optional[str],
        input: Any,
        metadata: Any,
        extra: Optional[dict[str, Any]] = None,
    ) -> Iterator[_Span]:
        span_id = new_id("obs_")
        parent = context.current_span()
        body: dict[str, Any] = {
            "id": span_id,
            "traceId": self._id,
            "name": name,
            "startTime": _iso(_utcnow()),
            "input": input,
            "metadata": metadata,
        }
        if parent:
            body["parentObservationId"] = parent
        if extra:
            body.update({k: v for k, v in extra.items() if v is not None})
        evt = {
            "SPAN": "span-create",
            "GENERATION": "generation-create",
            "EVENT": "event-create",
        }[obs_type]
        self._client._enqueue(evt, body)

        span = _Span(self._client, self._id, span_id, obs_type)
        token = context.push_span(span_id)
        try:
            yield span
            if not span._ended:
                span.end()
        except Exception as exc:
            if not span._ended:
                span.end(status="ERROR", status_message=str(exc))
            raise
        finally:
            context.pop_span(token)


class Client:
    """The Mini Langfuse SDK client.

    Example:
        client = Client("pk-lf-demo", "sk-lf-demo", host="http://localhost:8000")
        with client.trace(name="chat", user_id="u1") as t:
            with t.span(name="retrieve"):
                ...
            with t.generation(name="llm", model="gpt-4o") as g:
                g.update(output="hi", usage={"prompt_tokens": 5, "completion_tokens": 3})
    """

    _default: "Client | None" = None

    def __init__(
        self,
        public_key: str,
        secret_key: str,
        host: str = "http://localhost:8000",
        timeout: float = 5.0,
        batch_size: int = 50,
        flush_interval: float = 1.0,
        make_default: bool = True,
    ) -> None:
        self._host = host.rstrip("/")
        creds = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
        self._http = httpx.Client(
            timeout=timeout,
            headers={
                "Authorization": f"Basic {creds}",
                "Content-Type": "application/json",
            },
        )
        self._flusher = Flusher(
            post=self._post_batch,
            batch_size=batch_size,
            flush_interval=flush_interval,
        )
        if make_default:
            Client._default = self

    def _post_batch(self, batch: list[dict[str, Any]]) -> None:
        resp = self._http.post(
            f"{self._host}/api/public/ingestion",
            content=json_dumps({"batch": batch}),
        )
        if resp.status_code >= 400:
            log.warning(
                "mini_langfuse ingestion HTTP %s: %s",
                resp.status_code,
                resp.text[:200],
            )

    @classmethod
    def get_default(cls) -> "Client | None":
        return cls._default

    @classmethod
    def set_default(cls, client: "Client") -> None:
        cls._default = client

    # -------- Public API --------
    @contextmanager
    def trace(
        self,
        name: Optional[str] = None,
        *,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        input: Any = None,
        metadata: Any = None,
        tags: Optional[list[str]] = None,
    ) -> Iterator[_Trace]:
        trace_id = new_id("trace_")
        body: dict[str, Any] = {
            "id": trace_id,
            "name": name,
            "userId": user_id,
            "sessionId": session_id,
            "input": input,
            "metadata": metadata,
            "tags": tags,
            "timestamp": _iso(_utcnow()),
        }
        self._enqueue("trace-create", body)

        tr = _Trace(self, trace_id)
        token_trace = context.current_trace_id.set(trace_id)
        try:
            yield tr
        except Exception as exc:
            tr.update(output=f"ERROR: {exc}")
            raise
        finally:
            context.current_trace_id.reset(token_trace)
            # No sync flush - the background thread will drain within flush_interval.

    def flush(self, timeout: float = 5.0) -> None:
        """Block until pending events are drained (best effort)."""
        self._flusher.flush(timeout=timeout)

    def close(self) -> None:
        try:
            self._flusher.shutdown(timeout=5.0)
        finally:
            self._http.close()

    # -------- Score & Prompt (M4) --------
    def score(
        self,
        *,
        name: str,
        trace_id: str,
        value: Optional[float] = None,
        string_value: Optional[str] = None,
        data_type: str = "NUMERIC",
        observation_id: Optional[str] = None,
        source: str = "API",
        comment: Optional[str] = None,
    ) -> dict[str, Any]:
        """Post a Score synchronously (they're rare enough that a direct POST is fine)."""
        payload = {
            "name": name,
            "traceId": trace_id,
            "observationId": observation_id,
            "dataType": data_type,
            "value": value,
            "stringValue": string_value,
            "source": source,
            "comment": comment,
        }
        resp = self._http.post(
            f"{self._host}/api/public/scores",
            content=json_dumps({k: v for k, v in payload.items() if v is not None}),
        )
        resp.raise_for_status()
        return resp.json()

    def create_prompt(
        self,
        *,
        name: str,
        content: Any,
        type: str = "text",
        config: Optional[Any] = None,
        labels: Optional[list[str]] = None,
        commit_message: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new prompt or a new version of an existing one."""
        payload = {
            "name": name,
            "type": type,
            "content": content,
            "config": config,
            "labels": labels,
            "commitMessage": commit_message,
            "createdBy": created_by,
        }
        resp = self._http.post(
            f"{self._host}/api/public/prompts",
            content=json_dumps({k: v for k, v in payload.items() if v is not None}),
        )
        resp.raise_for_status()
        return resp.json()

    def get_prompt(
        self,
        name: str,
        *,
        version: Optional[int] = None,
        label: Optional[str] = None,
    ):
        """Resolve a prompt version by name (+ optional version or label)."""
        from .prompts import PromptClient

        params = []
        if version is not None:
            params.append(f"version={version}")
        if label is not None:
            params.append(f"label={label}")
        qs = ("?" + "&".join(params)) if params else ""
        resp = self._http.get(f"{self._host}/api/public/prompts/{name}/resolve{qs}")
        resp.raise_for_status()
        data = resp.json()
        return PromptClient(
            id=data["id"],
            name=name,
            version=data["version"],
            type=data["type"],
            raw_content=data["content"],
            labels=data.get("labels"),
            config=data.get("config"),
        )

    # -------- Internal --------
    def _enqueue(self, evt_type: str, body: dict[str, Any]) -> None:
        self._flusher.enqueue(
            {
                "id": new_id("evt_"),
                "type": evt_type,
                "timestamp": _iso(_utcnow()),
                "body": body,
            }
        )
