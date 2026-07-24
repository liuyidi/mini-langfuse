"""OpenAI drop-in wrapper.

Usage:
    from mini_langfuse import Client
    from mini_langfuse.openai import OpenAI

    Client("pk-lf-demo", "sk-lf-demo")  # sets default client
    client = OpenAI()                    # instrumented; same signature as openai.OpenAI

    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "hi"}],
    )

Each call auto-creates a GENERATION observation with input=messages,
output=response text, model, model parameters, and usage tokens.
If no active trace, a trace is auto-created around the single call.
"""
from __future__ import annotations

from typing import Any

from . import context
from .client import Client, _Trace

try:
    import openai as _openai  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    _openai = None


def _dump_messages(messages: Any) -> Any:
    """Convert OpenAI SDK message objects to dicts for JSON storage."""
    if messages is None:
        return None
    out = []
    for m in messages:
        if hasattr(m, "model_dump"):
            out.append(m.model_dump())
        elif isinstance(m, dict):
            out.append(m)
        else:
            out.append(str(m))
    return out


def _extract_output(resp: Any) -> Any:
    """Best-effort extract the assistant's message content from a ChatCompletion."""
    try:
        choice = resp.choices[0]
        msg = getattr(choice, "message", None) or choice.get("message")
        if msg is None:
            return None
        if hasattr(msg, "model_dump"):
            return msg.model_dump()
        if isinstance(msg, dict):
            return msg
        return {"content": getattr(msg, "content", None)}
    except Exception:
        return None


def _extract_usage(resp: Any) -> dict[str, int] | None:
    u = getattr(resp, "usage", None)
    if u is None:
        return None
    d = u.model_dump() if hasattr(u, "model_dump") else dict(u)
    return {
        "prompt_tokens": d.get("prompt_tokens") or d.get("input_tokens"),
        "completion_tokens": d.get("completion_tokens") or d.get("output_tokens"),
        "total_tokens": d.get("total_tokens"),
    }


def _wrap_create(original_create):
    """Wrap client.chat.completions.create to add a GENERATION."""

    def wrapper(*args: Any, **kwargs: Any):
        mlf = Client.get_default()
        if mlf is None:
            return original_create(*args, **kwargs)

        model = kwargs.get("model", "unknown")
        messages = kwargs.get("messages")
        # model parameters = everything but messages/stream (which we'd handle separately)
        model_parameters = {
            k: v for k, v in kwargs.items() if k not in ("model", "messages")
        }

        # Attach to current trace or open a new one
        trace_ctx = None
        if context.current_trace_id.get() is None:
            trace_ctx = mlf.trace(name=f"openai:{model}")
            trace = trace_ctx.__enter__()
        else:
            trace = _Trace(mlf, context.current_trace_id.get())  # type: ignore[arg-type]

        gen_cm = trace.generation(
            name=f"openai:{model}",
            model=model,
            model_parameters=model_parameters,
            input={"messages": _dump_messages(messages)},
        )
        gen = gen_cm.__enter__()
        try:
            resp = original_create(*args, **kwargs)
            gen.update(
                output=_extract_output(resp),
                usage=_extract_usage(resp),
            )
            gen_cm.__exit__(None, None, None)
            return resp
        except Exception as exc:
            gen_cm.__exit__(type(exc), exc, exc.__traceback__)
            raise
        finally:
            if trace_ctx is not None:
                trace_ctx.__exit__(None, None, None)

    return wrapper


class OpenAI:
    """Drop-in replacement for openai.OpenAI() that adds mini-langfuse tracing."""

    def __new__(cls, *args: Any, **kwargs: Any):
        if _openai is None:
            raise ImportError(
                "The `openai` package is not installed. Install it or use "
                "mini_langfuse.Client directly."
            )
        client = _openai.OpenAI(*args, **kwargs)
        _instrument(client)
        return client


def _instrument(client: Any) -> None:
    """Monkey-patch `client.chat.completions.create` on a live OpenAI client."""
    completions = client.chat.completions
    if getattr(completions.create, "__mlf_wrapped__", False):
        return
    original = completions.create
    wrapped = _wrap_create(original)
    wrapped.__mlf_wrapped__ = True  # type: ignore[attr-defined]
    completions.create = wrapped
