"""LlamaIndex callback handler for Mini Langfuse (M22).

Usage:
    from mini_langfuse.integrations.llama_index import MiniLangfuseCallbackHandler

    handler = MiniLangfuseCallbackHandler(
        public_key="pk-lf-xxx",
        secret_key="sk-lf-xxx",
        host="http://localhost:8000",
    )

    # Register with LlamaIndex
    from llama_index.core import Settings
    Settings.callback_manager.add_handler(handler)

    # Or use with a specific query engine
    from llama_index.core.callbacks import CallbackManager
    cb_manager = CallbackManager([handler])
    query_engine = index.as_query_engine(callback_manager=cb_manager)
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional
from uuid import UUID

from ..client import Client

log = logging.getLogger("mini_langfuse.llama_index")

# LlamaIndex event types we handle
CBEventType = None  # Will be imported lazily


def _get_event_type():
    """Lazily import CBEventType to avoid hard dependency."""
    global CBEventType
    if CBEventType is None:
        try:
            from llama_index.core.callbacks import CBEventType as _CBEventType
            CBEventType = _CBEventType
        except ImportError:
            CBEventType = type("CBEventType", (), {
                "LLM": "llm",
                "EMBEDDING": "embedding",
                "RETRIEVE": "retrieve",
                "SYNTHESIZE": "synthesize",
                "CHUNKING": "chunking",
                "AGENT_STEP": "agent_step",
                "FUNCTION_CALL": "function_call",
            })
    return CBEventType


class MiniLangfuseCallbackHandler:
    """LlamaIndex callback handler that sends traces to Mini Langfuse.

    Maps LlamaIndex events to Mini Langfuse traces/spans/generations:
    - LLM events → GENERATION
    - RETRIEVE events → SPAN
    - SYNTHESIZE events → SPAN
    - EMBEDDING events → SPAN
    - CHUNKING events → SPAN
    """

    def __init__(
        self,
        public_key: str,
        secret_key: str,
        host: str = "http://localhost:8000",
        **kwargs: Any,
    ) -> None:
        self._client = Client(public_key, secret_key, host=host, **kwargs)
        self._trace = None
        self._trace_cm = None
        self._spans: Dict[str, Any] = {}  # event_id -> span

    def _ensure_trace(self, name: str = "llama-index") -> None:
        """Ensure a trace exists."""
        if self._trace is None:
            self._trace_cm = self._client.trace(name=name)
            self._trace = self._trace_cm.__enter__()

    # =========================================================================
    # Event handlers (LlamaIndex callback interface)
    # =========================================================================

    def on_event_start(
        self,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        event_id: str = "",
        parent_id: str = "",
        **kwargs: Any,
    ) -> str:
        """Called when any LlamaIndex event starts."""
        ET = _get_event_type()
        payload = payload or {}

        if event_type == ET.LLM:
            return self._on_llm_start(payload, event_id)
        elif event_type == ET.RETRIEVE:
            return self._on_retrieve_start(payload, event_id)
        elif event_type == ET.SYNTHESIZE:
            return self._on_synthesize_start(payload, event_id)
        elif event_type == ET.EMBEDDING:
            return self._on_embedding_start(payload, event_id)
        elif event_type == ET.CHUNKING:
            return self._on_chunking_start(payload, event_id)
        else:
            return self._on_generic_start(event_type, payload, event_id)

    def on_event_end(
        self,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        event_id: str = "",
        **kwargs: Any,
    ) -> None:
        """Called when any LlamaIndex event ends."""
        ET = _get_event_type()
        payload = payload or {}

        if event_type == ET.LLM:
            self._on_llm_end(payload, event_id)
        elif event_type == ET.RETRIEVE:
            self._on_retrieve_end(payload, event_id)
        elif event_type == ET.SYNTHESIZE:
            self._on_synthesize_end(payload, event_id)
        elif event_type == ET.EMBEDDING:
            self._on_embedding_end(payload, event_id)
        elif event_type == ET.CHUNKING:
            self._on_chunking_end(payload, event_id)
        else:
            self._on_generic_end(payload, event_id)

    # =========================================================================
    # LLM events → GENERATION
    # =========================================================================

    def _on_llm_start(self, payload: Dict[str, Any], event_id: str) -> str:
        self._ensure_trace("llama-index-llm")
        model = payload.get("model", payload.get("model_name", "unknown"))
        messages = payload.get("messages", [])

        gen = self._trace.generation(
            name="llm",
            model=model,
            input=messages if messages else payload.get("prompts"),
        )
        self._spans[event_id] = gen
        return event_id

    def _on_llm_end(self, payload: Dict[str, Any], event_id: str) -> None:
        span = self._spans.pop(event_id, None)
        if span is None:
            return

        response = payload.get("response", {})
        output = ""
        usage = {}

        if hasattr(response, "response"):
            output = response.response
        elif isinstance(response, dict):
            output = response.get("response", str(response))
        else:
            output = str(response)

        # Extract usage
        if hasattr(response, "raw") and response.raw:
            raw = response.raw
            if isinstance(raw, dict) and "usage" in raw:
                u = raw["usage"]
                usage = {
                    "prompt_tokens": u.get("prompt_tokens"),
                    "completion_tokens": u.get("completion_tokens"),
                    "total_tokens": u.get("total_tokens"),
                }

        span.end(output=output, usage=usage)
        self._check_cleanup()

    # =========================================================================
    # Retrieve events → SPAN
    # =========================================================================

    def _on_retrieve_start(self, payload: Dict[str, Any], event_id: str) -> str:
        self._ensure_trace("llama-index-retrieval")
        query = payload.get("query_str", payload.get("query", ""))
        span = self._trace.span(name="retrieve", input={"query": query})
        self._spans[event_id] = span
        return event_id

    def _on_retrieve_end(self, payload: Dict[str, Any], event_id: str) -> None:
        span = self._spans.pop(event_id, None)
        if span is None:
            return
        nodes = payload.get("nodes", [])
        docs = []
        for node in nodes[:20]:
            if hasattr(node, "get_content"):
                docs.append({"content": node.get_content(), "score": getattr(node, "score", None)})
            else:
                docs.append({"content": str(node)})
        span.end(output={"retrieved_docs": docs, "count": len(nodes)})

    # =========================================================================
    # Synthesize events → SPAN
    # =========================================================================

    def _on_synthesize_start(self, payload: Dict[str, Any], event_id: str) -> str:
        self._ensure_trace("llama-index-synthesize")
        query = payload.get("query_str", "")
        span = self._trace.span(name="synthesize", input={"query": query})
        self._spans[event_id] = span
        return event_id

    def _on_synthesize_end(self, payload: Dict[str, Any], event_id: str) -> None:
        span = self._spans.pop(event_id, None)
        if span is None:
            return
        response = payload.get("response", "")
        output = response.response if hasattr(response, "response") else str(response)
        span.end(output=output)
        self._check_cleanup()

    # =========================================================================
    # Embedding events → SPAN
    # =========================================================================

    def _on_embedding_start(self, payload: Dict[str, Any], event_id: str) -> str:
        self._ensure_trace("llama-index-embedding")
        span = self._trace.span(name="embedding", input=payload)
        self._spans[event_id] = span
        return event_id

    def _on_embedding_end(self, payload: Dict[str, Any], event_id: str) -> None:
        span = self._spans.pop(event_id, None)
        if span is not None:
            span.end(output={"chunks": len(payload.get("chunks", []))})

    # =========================================================================
    # Chunking events → SPAN
    # =========================================================================

    def _on_chunking_start(self, payload: Dict[str, Any], event_id: str) -> str:
        self._ensure_trace("llama-index-chunking")
        span = self._trace.span(name="chunking", input=payload)
        self._spans[event_id] = span
        return event_id

    def _on_chunking_end(self, payload: Dict[str, Any], event_id: str) -> None:
        span = self._spans.pop(event_id, None)
        if span is not None:
            span.end(output={"chunks": len(payload.get("chunks", []))})

    # =========================================================================
    # Generic fallback
    # =========================================================================

    def _on_generic_start(self, event_type: str, payload: Dict[str, Any], event_id: str) -> str:
        self._ensure_trace("llama-index")
        span = self._trace.span(name=str(event_type), input=payload)
        self._spans[event_id] = span
        return event_id

    def _on_generic_end(self, payload: Dict[str, Any], event_id: str) -> None:
        span = self._spans.pop(event_id, None)
        if span is not None:
            span.end(output=payload)

    # =========================================================================
    # Lifecycle
    # =========================================================================

    def _check_cleanup(self) -> None:
        """Clean up trace if no more active spans."""
        if not self._spans and self._trace_cm is not None:
            try:
                self._trace_cm.__exit__(None, None, None)
            except Exception:
                pass
            self._trace_cm = None
            self._trace = None

    def flush(self) -> None:
        """Flush pending events and clean up."""
        self._client.flush()
        if self._trace_cm is not None:
            try:
                self._trace_cm.__exit__(None, None, None)
            except Exception:
                pass
            self._trace_cm = None
            self._trace = None
        self._spans.clear()

    # LlamaIndex expects these attributes
    @property
    def event_map(self):
        """Return event mapping for LlamaIndex callback registration."""
        return {}

    def start_trace(self, trace_type: str = "", **kwargs: Any) -> None:
        """Called by LlamaIndex to start a trace."""
        self._ensure_trace(trace_type or "llama-index")

    def end_trace(self, trace_type: str = "", trace_id: str = "", **kwargs: Any) -> None:
        """Called by LlamaIndex to end a trace."""
        self._check_cleanup()
