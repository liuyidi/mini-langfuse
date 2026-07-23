"""Contextvars: track current trace id and span stack across nested calls / async."""
from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

# The active trace id for the current logical call.
current_trace_id: ContextVar[Optional[str]] = ContextVar("mlf_current_trace_id", default=None)

# Stack of active observation ids (deepest last). We store ids only; the SDK client
# holds the actual span/generation objects if needed.
current_span_stack: ContextVar[tuple[str, ...]] = ContextVar(
    "mlf_current_span_stack", default=()
)


def current_span() -> Optional[str]:
    stack = current_span_stack.get()
    return stack[-1] if stack else None


def push_span(span_id: str) -> object:
    """Push a span; returns a token you must pass to pop_span()."""
    stack = current_span_stack.get()
    return current_span_stack.set(stack + (span_id,))


def pop_span(token: object) -> None:
    current_span_stack.reset(token)
