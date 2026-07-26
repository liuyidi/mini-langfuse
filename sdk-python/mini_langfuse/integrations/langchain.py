"""LangChain callback handler for Mini Langfuse (M22).

Usage:
    from mini_langfuse.integrations.langchain import MiniLangfuseCallbackHandler

    handler = MiniLangfuseCallbackHandler(
        public_key="pk-lf-xxx",
        secret_key="sk-lf-xxx",
        host="http://localhost:8000",
    )

    # With LLM
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(callbacks=[handler])
    result = llm.invoke("Hello!")

    # With Chain
    from langchain.chains import LLMChain
    from langchain.prompts import PromptTemplate
    chain = LLMChain(llm=llm, prompt=PromptTemplate.from_template("{q}"), callbacks=[handler])
    result = chain.invoke({"q": "Hello!"})

    # With Agent
    from langchain.agents import initialize_agent, Tool
    agent = initialize_agent(tools, llm, callbacks=[handler])
    result = agent.run("What's the weather?")
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Union
from uuid import UUID

from ..client import Client

log = logging.getLogger("mini_langfuse.langchain")


class MiniLangfuseCallbackHandler:
    """LangChain callback handler that sends traces to Mini Langfuse.

    Implements the LangChain BaseCallbackHandler interface.
    Maps LangChain events to Mini Langfuse traces/spans/generations.
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
        self._spans: Dict[UUID, Any] = {}  # run_id -> span context manager

    # =========================================================================
    # Chain callbacks
    # =========================================================================

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> None:
        """Called when a chain starts."""
        name = serialized.get("name", serialized.get("id", ["unknown"])[-1])

        if self._trace is None:
            # Top-level chain → create trace
            self._trace_cm = self._client.trace(
                name=name,
                input=inputs,
                metadata={"serialized": str(serialized), **(metadata or {})},
                tags=tags,
            )
            self._trace = self._trace_cm.__enter__()
            self._spans[run_id] = self._trace
        else:
            # Nested chain → create span
            span = self._trace.span(name=name, input=inputs)
            self._spans[run_id] = span

    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when a chain ends successfully."""
        span = self._spans.pop(run_id, None)
        if span is not None and span is not self._trace:
            span.end(output=outputs)

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when a chain errors."""
        span = self._spans.pop(run_id, None)
        if span is not None and span is not self._trace:
            span.end(output=str(error), status="ERROR", status_message=str(error))

        # If this is the top-level trace, exit it
        if run_id in self._spans and self._spans[run_id] is self._trace:
            self._cleanup_trace()

    # =========================================================================
    # LLM callbacks
    # =========================================================================

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM starts."""
        if self._trace is None:
            self._trace_cm = self._client.trace(name="llm-call", input=prompts)
            self._trace = self._trace_cm.__enter__()

        model = serialized.get("model_name", serialized.get("model", "unknown"))
        inv_params = kwargs.get("invocation_params", {})

        gen = self._trace.generation(
            name="llm",
            model=model,
            input=prompts,
            model_parameters=inv_params,
        )
        self._spans[run_id] = gen

    def on_llm_end(
        self,
        response: Any,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM completes."""
        span = self._spans.pop(run_id, None)
        if span is None:
            return

        # Extract text and usage
        text_output = ""
        usage = {}
        try:
            # langchain_core.outputs.LLMResult
            if hasattr(response, "generations") and response.generations:
                gen_list = response.generations[0]
                if gen_list:
                    text_output = gen_list[0].text if hasattr(gen_list[0], "text") else str(gen_list[0])

            if hasattr(response, "llm_output") and response.llm_output:
                llm_out = response.llm_output
                if "token_usage" in llm_out:
                    tu = llm_out["token_usage"]
                    usage = {
                        "prompt_tokens": tu.get("prompt_tokens"),
                        "completion_tokens": tu.get("completion_tokens"),
                        "total_tokens": tu.get("total_tokens"),
                    }
        except Exception:
            text_output = str(response)

        span.end(output=text_output, usage=usage)

    def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM errors."""
        span = self._spans.pop(run_id, None)
        if span is not None:
            span.end(output=str(error), status="ERROR", status_message=str(error))

    # =========================================================================
    # Tool callbacks
    # =========================================================================

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool starts."""
        if self._trace is None:
            self._trace_cm = self._client.trace(name="tool-call")
            self._trace = self._trace_cm.__enter__()

        name = serialized.get("name", "tool")
        span = self._trace.span(name=name, input={"tool_input": input_str})
        self._spans[run_id] = span

    def on_tool_end(
        self,
        output: str,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when a tool completes."""
        span = self._spans.pop(run_id, None)
        if span is not None:
            span.end(output=output)

    def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when a tool errors."""
        span = self._spans.pop(run_id, None)
        if span is not None:
            span.end(output=str(error), status="ERROR", status_message=str(error))

    # =========================================================================
    # Retriever callbacks
    # =========================================================================

    def on_retriever_start(
        self,
        serialized: Dict[str, Any],
        query: str,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> None:
        """Called when a retriever starts."""
        if self._trace is None:
            self._trace_cm = self._client.trace(name="retrieval")
            self._trace = self._trace_cm.__enter__()

        name = serialized.get("name", "retriever")
        span = self._trace.span(name=name, input={"query": query})
        self._spans[run_id] = span

    def on_retriever_end(
        self,
        documents: Sequence[Any],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when a retriever completes."""
        span = self._spans.pop(run_id, None)
        if span is not None:
            docs = [{"content": str(d), "metadata": getattr(d, "metadata", {})} for d in documents]
            span.end(output=docs)

    def on_retriever_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when a retriever errors."""
        span = self._spans.pop(run_id, None)
        if span is not None:
            span.end(output=str(error), status="ERROR", status_message=str(error))

    # =========================================================================
    # Agent callbacks
    # =========================================================================

    def on_agent_action(
        self,
        action: Any,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when an agent takes an action."""
        pass  # Tool start/end handles this

    def on_agent_finish(
        self,
        finish: Any,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        """Called when an agent finishes."""
        if self._trace is not None:
            output = str(finish.return_values) if hasattr(finish, "return_values") else str(finish)
            self._trace.update(output=output)
            self._cleanup_trace()

    # =========================================================================
    # Lifecycle
    # =========================================================================

    def _cleanup_trace(self) -> None:
        """Clean up the trace context manager."""
        if self._trace_cm is not None:
            try:
                self._trace_cm.__exit__(None, None, None)
            except Exception:
                pass
            self._trace_cm = None
        self._trace = None

    def flush(self) -> None:
        """Flush pending events."""
        self._client.flush()
        self._cleanup_trace()

    # =========================================================================
    # LangChain compatibility: register as a callback handler
    # =========================================================================

    @property
    def always_verbose(self) -> bool:
        return True

    def __repr__(self) -> str:
        return f"MiniLangfuseCallbackHandler(host={self._client._host})"
