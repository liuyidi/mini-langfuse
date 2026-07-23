# mini-langfuse

A minimal, from-scratch re-implementation of [Langfuse](https://langfuse.com) built to understand its internals.
Backend: **FastAPI + SQLAlchemy + SQLite**. Frontend: **React + Vite + TypeScript + Tailwind**. SDK: **Python + httpx**.

📄 See [`mini-langfuse-plan.md`](./mini-langfuse-plan.md) for the full design doc, data model, and 5-milestone roadmap.

## Status

- ✅ **Milestone 1** — End-to-end minimum loop: ingestion API, trace/observation model, tree view UI, working Python SDK, demo script.
- ⏳ Milestone 2 — Generation & cost calculation (upcoming)
- ⏳ Milestone 3 — Session view & background flusher
- ⏳ Milestone 4 — Scores & Prompt versioning
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

Open http://localhost:5173 — you should see 3 traces. Click one to see the observation tree, click a span to see its input/output/metadata.

## Using the SDK

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

## API (M1)

All under HTTP Basic auth using the demo keys.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/public/ingestion` | Batch event upsert (trace/span/generation/event × create/update) |
| GET | `/api/public/traces` | List traces with aggregate metrics |
| GET | `/api/public/traces/:id` | Trace detail with tree of observations |
| GET | `/health` | Liveness probe |

## Learn more

- Read the full plan: [`mini-langfuse-plan.md`](./mini-langfuse-plan.md)
- Real Langfuse: https://github.com/langfuse/langfuse
