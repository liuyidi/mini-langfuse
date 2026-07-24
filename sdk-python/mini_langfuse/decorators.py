"""@observe decorator.

Wraps a function so that each call becomes a Span (default) or Generation
(when as_type="generation"). Handles both sync and async functions.

If there's an active trace on the current context, the wrapped call attaches
as a child. Otherwise it opens a new trace named after the function.
"""
from __future__ import annotations

import asyncio
import functools
import inspect
from typing import Any, Callable, Literal, Optional, TypeVar

from . import context
from .client import Client, _Trace

F = TypeVar("F", bound=Callable[..., Any])

ObserveType = Literal["span", "generation"]


def _capture_args(func: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]) -> dict[str, Any]:
    """Bind call args to parameter names for a useful `input` payload."""
    try:
        sig = inspect.signature(func)
        bound = sig.bind_partial(*args, **kwargs)
        bound.apply_defaults()
        out: dict[str, Any] = {}
        for k, v in bound.arguments.items():
            if k in ("self", "cls"):
                continue
            # Fall back to repr for non-JSON-serializable values (server side JSONs everything)
            out[k] = _safe(v)
        return out
    except Exception:
        return {"args": [_safe(a) for a in args], "kwargs": {k: _safe(v) for k, v in kwargs.items()}}


def _safe(v: Any) -> Any:
    """Best-effort make v JSON-serializable."""
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, (list, tuple)):
        return [_safe(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _safe(x) for k, x in v.items()}
    return repr(v)


def observe(
    _fn: Optional[F] = None,
    *,
    name: Optional[str] = None,
    as_type: ObserveType = "span",
    model: Optional[str] = None,
    capture_input: bool = True,
    capture_output: bool = True,
    client: Optional[Client] = None,
) -> Callable[[F], F] | F:
    """Decorator: capture the call as a span or generation.

    Usage:
        @observe()
        def my_step(x): ...

        @observe(as_type="generation", model="gpt-4o-mini")
        def call_llm(prompt): ...
    """

    def decorator(func: F) -> F:
        span_name = name or func.__qualname__
        is_async = asyncio.iscoroutinefunction(func)

        def _get_client() -> Optional[Client]:
            return client or Client.get_default()

        def _open_and_run(
            trace: _Trace,
            args: tuple[Any, ...],
            kwargs: dict[str, Any],
        ):
            cm = (
                trace.generation(name=span_name, model=model, input=_capture_args(func, args, kwargs) if capture_input else None)
                if as_type == "generation"
                else trace.span(name=span_name, input=_capture_args(func, args, kwargs) if capture_input else None)
            )
            return cm

        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
            c = _get_client()
            if c is None:
                # SDK not configured - just run the function
                return func(*args, **kwargs)

            trace_ctx = None
            if context.current_trace_id.get() is None:
                trace_ctx = c.trace(name=span_name)
                trace = trace_ctx.__enter__()
            else:
                trace = _Trace(c, context.current_trace_id.get())  # type: ignore[arg-type]

            cm = _open_and_run(trace, args, kwargs)
            span = cm.__enter__()
            try:
                result = func(*args, **kwargs)
                if capture_output:
                    span.update(output=_safe(result))
                cm.__exit__(None, None, None)
                return result
            except Exception as exc:
                cm.__exit__(type(exc), exc, exc.__traceback__)
                raise
            finally:
                if trace_ctx is not None:
                    trace_ctx.__exit__(None, None, None)

        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
            c = _get_client()
            if c is None:
                return await func(*args, **kwargs)

            trace_ctx = None
            if context.current_trace_id.get() is None:
                trace_ctx = c.trace(name=span_name)
                trace = trace_ctx.__enter__()
            else:
                trace = _Trace(c, context.current_trace_id.get())  # type: ignore[arg-type]

            cm = _open_and_run(trace, args, kwargs)
            span = cm.__enter__()
            try:
                result = await func(*args, **kwargs)
                if capture_output:
                    span.update(output=_safe(result))
                cm.__exit__(None, None, None)
                return result
            except Exception as exc:
                cm.__exit__(type(exc), exc, exc.__traceback__)
                raise
            finally:
                if trace_ctx is not None:
                    trace_ctx.__exit__(None, None, None)

        return async_wrapper if is_async else sync_wrapper  # type: ignore[return-value]

    # Support `@observe` without parentheses
    if _fn is not None and callable(_fn):
        return decorator(_fn)  # type: ignore[return-value]
    return decorator
