# mini-langfuse

A minimal, from-scratch re-implementation of [Langfuse](https://langfuse.com) built to understand its internals.
Backend: **FastAPI + SQLAlchemy + SQLite**. Frontend: **React + Vite + TypeScript + Tailwind**. SDK: **Python + httpx**.

📄 See [`mini-langfuse-plan.md`](./mini-langfuse-plan.md) for the full design doc, data model, and 5-milestone roadmap.

## Status

- ✅ **Milestone 1** — End-to-end minimum loop: ingestion API, trace/observation model, tree view UI, working Python SDK, demo script.
- ✅ **Milestone 2** — Generation cost calculation from built-in pricing table (OpenAI, Anthropic, Gemini); `@observe` decorator; `mini_langfuse.openai` drop-in wrapper; cost breakdown in UI.
- ✅ **Milestone 3** — Session aggregation view; background flusher thread (non-blocking, atexit-safe); UI sessions list + conversation timeline.
- ✅ **Milestone 4** — Score API + inline scoring UI (numeric / boolean / categorical); versioned Prompts with mutable `production` label pointer; SDK `create_prompt`, `get_prompt(name, label=...)`, `PromptClient.compile(vars)`; Prompt diff viewer in UI; Generation → PromptVersion link.
- ⏳ Milestone 5 — Docker, polish, tests

## Repo layout

```
mini-langfuse/
├── server/         # FastAPI backend
├── sdk-python/     # Python client SDK
├── web/            # React + Vite frontend
├── demo.py         # Generates sample traces
└── mini-langfuse-plan.md
```

## Quickstart (M1)

Three terminals.

### 1. Backend

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload  # http://localhost:8000
```

The first run creates a SQLite DB at `server/mini_langfuse.db` and seeds a demo project.

Demo credentials (hardcoded for M1):
- `public_key = pk-lf-demo`
- `secret_key = sk-lf-demo`

### 2. Frontend

```bash
cd web
npm install
npm run dev  # http://localhost:5173
```

Vite proxies `/api/*` to the backend on `:8000`.

### 3. Generate demo traces

```bash
cd sdk-python
pip install -e .          # into the same virtualenv as the server, or a new one
python ../demo.py
```

Open http://localhost:5173 — you should see 4 traces. Click one to see the observation tree, click a span to see its input/output/metadata.

## Using the SDK

### Manual API

```python
from mini_langfuse import Client

client = Client("pk-lf-demo", "sk-lf-demo", host="http://localhost:8000")

with client.trace(name="chat", user_id="alice", input={"q": "hi"}) as t:
    with t.span(name="retrieve") as s:
        docs = ["..."]
        s.update(output={"docs": docs})
    with t.generation(name="llm", model="gpt-4o", input={"prompt": "..."}) as g:
        g.update(
            output={"content": "..."},
            usage={"prompt_tokens": 10, "completion_tokens": 5},
        )

client.close()
```

Nested calls in the same context automatically become children of the enclosing span (via `contextvars`).
Exceptions inside a span mark it as `ERROR` before propagating.

### `@observe` decorator

```python
from mini_langfuse import Client, observe

Client("pk-lf-demo", "sk-lf-demo")  # becomes the default client

@observe()
def retrieve(q: str) -> list[str]:
    return search(q)

@observe(as_type="generation", model="gpt-4o-mini")
def summarize(docs: list[str]) -> str:
    return openai_call(docs)  # args auto-captured, return auto-captured
```

If no trace is active, `@observe` auto-opens one named after the function. Nested `@observe`-decorated calls become children automatically.

### OpenAI drop-in wrapper

```python
from mini_langfuse import Client
from mini_langfuse.openai import OpenAI  # instead of `from openai import OpenAI`

Client("pk-lf-demo", "sk-lf-demo")
client = OpenAI()

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "hi"}],
)
# GENERATION observation is auto-recorded with model, messages, output, and cost.
```

### Prompt versioning + `production` label

```python
# Create v1
v1 = client.create_prompt(
    name="support",
    type="chat",
    content=[
        {"role": "system", "content": "Be polite."},
        {"role": "user", "content": "{{question}}"},
    ],
)
# Ship v2 as production (label auto-moves from any older version)
v2 = client.create_prompt(
    name="support",
    type="chat",
    content=[...],  # updated content
    labels=["production"],
    commit_message="Firmer tone",
)

# In production code, always fetch by label — no redeploy needed to promote.
prompt = client.get_prompt("support", label="production")
messages = prompt.compile(question="Where's my order?")

with client.trace(name="support-answer") as t:
    with t.generation(name="reply", model="gpt-4o-mini",
                      input={"messages": messages},
                      prompt_version_id=prompt.id) as g:  # ← links to exact version
        ...
```

### Scoring

```python
client.score(
    trace_id=trace_id,
    name="helpfulness",
    data_type="NUMERIC",
    value=0.9,
    source="EVAL",
    comment="Concise and accurate",
)
```

Scores are also editable inline on the Trace detail page (numeric / boolean / categorical).

## Cost calculation

Cost is computed server-side from a built-in pricing table (`server/app/services/cost.py`) whenever a GENERATION includes `model` and `usage`. Supported: OpenAI (gpt-4o/mini/turbo/o1), Anthropic Claude 3/3.5/4, Google Gemini 1.5/2.0. Update the table when prices change.

## API

All under HTTP Basic auth using the demo keys.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/public/ingestion` | Batch event upsert (trace/span/generation/event × create/update) |
| GET | `/api/public/traces` | List traces with aggregate metrics |
| GET | `/api/public/traces/:id` | Trace detail with tree of observations |
| GET | `/api/public/sessions` | List sessions (aggregated by session_id) |
| GET | `/api/public/sessions/:id` | Session detail with all traces in time order |
| POST | `/api/public/scores` | Create a score on a trace or observation |
| GET | `/api/public/scores?traceId=` | List scores |
| POST | `/api/public/prompts` | Create prompt or a new version (auto-incrementing) |
| GET | `/api/public/prompts` | List prompts with latest version metadata |
| GET | `/api/public/prompts/:name` | Prompt detail with all versions |
| GET | `/api/public/prompts/:name/resolve?version=&label=` | Resolve a single version |
| PATCH | `/api/public/prompt-versions/:id/labels` | Move labels (each label points to one version) |
| GET | `/health` | Liveness probe |

## SDK internals — background flushing

Since M3 the SDK no longer blocks on network. `Client._enqueue()` drops events into a bounded `queue.Queue`; a daemon thread batches them by size (default 50) or interval (1s) and POSTs to `/ingestion`. An `atexit` hook drains what's left when the interpreter exits, so short-lived scripts don't lose events. Ingestion failures are logged and swallowed — user code never sees them.

You can tune it:

```python
Client(pk, sk, batch_size=100, flush_interval=0.5)  # more aggressive
client.flush(timeout=5)  # block until queue drained (for tests / notebooks)
```

## Learn more

- Read the full plan: [`mini-langfuse-plan.md`](./mini-langfuse-plan.md)
- Real Langfuse: https://github.com/langfuse/langfuse
