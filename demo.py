"""
Demo script: creates a few nested traces so the UI has something to render.

M2 highlights:
  - Uses @observe decorator (auto-captures args + return value)
  - Simulates LLM calls with cost computed from the built-in pricing table

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

from mini_langfuse import Client, observe


# --- Configure the default client so @observe knows where to send events ---
client = Client(
    public_key="pk-lf-demo",
    secret_key="sk-lf-demo",
    host="http://localhost:8000",
)


# ---- Decorated functions ----
@observe()
def retrieve(question: str) -> list[str]:
    time.sleep(0.12)
    return [f"Doc snippet relevant to '{question}'."]


@observe(as_type="generation", model="gpt-4o-mini")
def llm_answer(question: str, context: list[str]) -> str:
    """A decorated pure-function generation. Auto-captures args + return.

    NOTE: For real LLM cost accounting, use the mini_langfuse.openai wrapper
    (mini_langfuse.openai.OpenAI) which extracts usage from the response.
    """
    time.sleep(0.35)
    return f"Answer to: {question} (using {len(context)} docs)"


@observe()
def rag_pipeline(question: str) -> str:
    docs = retrieve(question)
    return llm_answer(question, docs)


def main() -> None:
    # ---- Trace 1: pure decorator flow ----
    with client.trace(
        name="rag-answer",
        user_id="user_alice",
        session_id="sess_1",
        input={"question": "What is Langfuse?"},
        tags=["demo", "rag"],
    ) as t:
        answer = rag_pipeline("What is Langfuse?")
        t.update(output={"answer": answer})

    # ---- Trace 2: manual span API + a failing sub-step ----
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
            pass  # SDK auto-marks the span as ERROR

        with t.generation(
            name="summarize",
            model="gpt-4o",
            input={"context": "attempted booking"},
        ) as g:
            time.sleep(0.15)
            g.update(
                output={"summary": "Booking failed; retry recommended."},
                usage={"prompt_tokens": 60, "completion_tokens": 22},
            )

    # ---- Trace 3: Claude call ----
    with client.trace(
        name="chat-turn",
        user_id="user_alice",
        session_id="sess_1",
        input={"message": "Follow-up question"},
    ) as t:
        for i in range(random.randint(1, 3)):
            with t.span(name=f"step-{i}") as span:
                time.sleep(0.03)
                span.update(output={"i": i})
        with t.generation(name="reply", model="claude-3-5-haiku") as g:
            time.sleep(0.1)
            g.update(
                output={"content": "Sure!"},
                usage={"prompt_tokens": 25, "completion_tokens": 4},
            )

    # ---- Trace 4: emulates what mini_langfuse.openai wrapper would produce ----
    # If you have `openai` installed & OPENAI_API_KEY set, use the real thing:
    #     from mini_langfuse.openai import OpenAI
    #     resp = OpenAI().chat.completions.create(model="gpt-4o", messages=[...])
    with client.trace(name="openai-emulation", user_id="user_carol") as t:
        with t.generation(
            name="openai:gpt-4o",
            model="gpt-4o",
            model_parameters={"temperature": 0.2, "max_tokens": 256},
            input={"messages": [{"role": "user", "content": "Explain SGD."}]},
        ) as g:
            time.sleep(0.42)
            g.update(
                output={
                    "role": "assistant",
                    "content": "SGD stands for stochastic gradient descent…",
                },
                usage={"prompt_tokens": 420, "completion_tokens": 180},
            )

    # ---- Traces 5-7: a 3-turn conversation grouped by session_id ----
    # This is what makes the Sessions view interesting.
    conv = "sess_conv_" + str(int(time.time()))
    turns = [
        ("What's the capital of France?", "Paris."),
        ("Population?", "About 2.1 million in the city, ~11 million metro."),
        ("Any famous museums?", "The Louvre, Musée d'Orsay, and Centre Pompidou."),
    ]
    for i, (q, a) in enumerate(turns, 1):
        with client.trace(
            name=f"chat-turn-{i}",
            user_id="user_dave",
            session_id=conv,
            input={"question": q},
            metadata={"turn": i},
        ) as t:
            with t.generation(
                name="reply",
                model="gpt-4o-mini",
                input={"messages": [{"role": "user", "content": q}]},
            ) as g:
                time.sleep(0.15)
                g.update(
                    output={"role": "assistant", "content": a},
                    usage={
                        "prompt_tokens": 30 + i * 10,
                        "completion_tokens": 10 + i * 4,
                    },
                )
            t.update(output={"answer": a})

    # ---- M4: Prompt version management + scoring ----
    # Create a prompt (v1)
    v1 = client.create_prompt(
        name="customer-support",
        type="chat",
        content=[
            {"role": "system", "content": "You are a polite support agent."},
            {"role": "user", "content": "The customer asks: {{question}}"},
        ],
        commit_message="Initial polite tone",
    )
    # Create v2 with a firmer tone
    v2 = client.create_prompt(
        name="customer-support",
        type="chat",
        content=[
            {"role": "system", "content": "You are a helpful, direct support agent. Be concise."},
            {"role": "user", "content": "The customer asks: {{question}}"},
        ],
        labels=["production"],  # points production label at v2
        commit_message="Firmer, more concise tone",
    )
    print(f"Prompt versions created: v{v1['version']}, v{v2['version']} (production)")

    # Fetch production prompt via SDK, compile with a variable, and log a generation using it
    prompt = client.get_prompt("customer-support", label="production")
    compiled_msgs = prompt.compile(question="Where's my order?")

    with client.trace(
        name="support-answer",
        user_id="user_eve",
        input={"question": "Where's my order?"},
    ) as t:
        with t.generation(
            name="reply",
            model="gpt-4o-mini",
            input={"messages": compiled_msgs},
            prompt_version_id=prompt.id,   # link the generation to the exact prompt version
        ) as g:
            time.sleep(0.2)
            g.update(
                output={"role": "assistant", "content": "It shipped yesterday; ETA Friday."},
                usage={"prompt_tokens": 55, "completion_tokens": 12},
            )
        # Grab the trace id for scoring below
        support_trace_id = t.id

    # Ensure everything is flushed so the trace exists before we score it
    client.flush(timeout=3)

    # Score the trace (auto/API source). Also demonstrates BOOLEAN and CATEGORICAL.
    client.score(
        trace_id=support_trace_id,
        name="helpfulness",
        data_type="NUMERIC",
        value=0.9,
        source="EVAL",
        comment="Concise and accurate",
    )
    client.score(
        trace_id=support_trace_id,
        name="follow-up-needed",
        data_type="BOOLEAN",
        value=0,  # 0 = false
        source="EVAL",
    )
    client.score(
        trace_id=support_trace_id,
        name="tone",
        data_type="CATEGORICAL",
        string_value="friendly",
        source="EVAL",
    )

    client.close()
    print("Demo traces created. Open http://localhost:5173 to see them.")


if __name__ == "__main__":
    main()
