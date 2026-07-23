"""
Demo script: creates a few nested traces so the UI has something to render.

Run:
    # 1) In one terminal, start the server:
    cd server && uvicorn app.main:app --reload

    # 2) In another, install the SDK and run this demo:
    cd sdk-python && pip install -e .
    python ../demo.py
"""
from __future__ import annotations

import random
import time

from mini_langfuse import Client


def main() -> None:
    client = Client(
        public_key="pk-lf-demo",
        secret_key="sk-lf-demo",
        host="http://localhost:8000",
    )

    # ---- Trace 1: A simple RAG-style pipeline ----
    with client.trace(
        name="rag-answer",
        user_id="user_alice",
        session_id="sess_1",
        input={"question": "What is Langfuse?"},
        tags=["demo", "rag"],
    ) as t:
        with t.span(name="retrieve", input={"q": "What is Langfuse?"}) as s:
            time.sleep(0.12)
            docs = ["Langfuse is an open-source LLM engineering platform."]
            s.update(output={"docs": docs})

        with t.generation(
            name="llm-answer",
            model="gpt-4o-mini",
            model_parameters={"temperature": 0.2, "max_tokens": 256},
            input={"prompt": "Use these docs: " + docs[0]},
        ) as g:
            time.sleep(0.35)
            g.update(
                output={
                    "content": "Langfuse is an open-source LLM engineering & observability platform."
                },
                usage={"prompt_tokens": 120, "completion_tokens": 42},
            )

        t.update(output={"answer": "Langfuse is an open-source LLM engineering platform."})

    # ---- Trace 2: Nested spans with a failing sub-step ----
    with client.trace(
        name="agent-loop",
        user_id="user_bob",
        session_id="sess_2",
        input={"goal": "book flight"},
    ) as t:
        with t.span(name="plan") as p:
            time.sleep(0.05)
            p.update(output={"steps": ["search", "compare", "book"]})

        with t.span(name="tool:search") as s:
            time.sleep(0.2)
            s.update(output={"flights": 3})

        try:
            with t.span(name="tool:book"):
                time.sleep(0.08)
                raise RuntimeError("Payment gateway timeout")
        except RuntimeError:
            pass  # SDK already recorded ERROR status on the span

        with t.generation(
            name="summarize", model="gpt-4o", input={"context": "attempted booking"}
        ) as g:
            time.sleep(0.15)
            g.update(
                output={"summary": "Booking failed; retry recommended."},
                usage={"prompt_tokens": 60, "completion_tokens": 22},
            )

    # ---- Trace 3: Random shape, another session for user_alice ----
    with client.trace(
        name="chat-turn",
        user_id="user_alice",
        session_id="sess_1",
        input={"message": "Follow-up question"},
    ) as t:
        depth = random.randint(1, 3)
        for i in range(depth):
            with t.span(name=f"step-{i}") as span:
                time.sleep(0.03)
                span.update(output={"i": i})

        with t.generation(name="reply", model="gpt-4o-mini") as g:
            time.sleep(0.1)
            g.update(
                output={"content": "Sure!"},
                usage={"prompt_tokens": 25, "completion_tokens": 4},
            )

    client.close()
    print("Demo traces created. Open http://localhost:5173 to see them.")


if __name__ == "__main__":
    main()
