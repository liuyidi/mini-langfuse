"""Mini Langfuse Python SDK.

Usage:
    from mini_langfuse import Client

    client = Client("pk-lf-demo", "sk-lf-demo")
    with client.trace(name="chat") as t:
        with t.span(name="retrieve") as s:
            s.update(output=results)
        with t.generation(name="llm", model="gpt-4o") as g:
            g.update(output="Hello!", usage={"total_tokens": 10})

Integrations (M22):
    from mini_langfuse.integrations.langchain import MiniLangfuseCallbackHandler
    from mini_langfuse.integrations.llama_index import MiniLangfuseCallbackHandler as LlamaHandler
"""
from .client import Client
from .context import current_span, current_trace_id
from .decorators import observe

__all__ = ["Client", "current_span", "current_trace_id", "observe"]
