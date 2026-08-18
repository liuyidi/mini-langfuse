# mini-langfuse

A minimal, from-scratch re-implementation of [Langfuse](https://langfuse.com) built to understand its internals.
Backend: **FastAPI + SQLAlchemy + SQLite/PostgreSQL**. Frontend: **React + Vite + TypeScript + Tailwind**. SDK: **Python + httpx**.

📄 See [`mini-langfuse-plan.md`](./docs/plans/mini-langfuse-plan.md) for the full design doc, data model, and 5-milestone roadmap. Extension directions (M6+) live in [`mini-langfuse-plan-v2.md`](./docs/plans/mini-langfuse-plan-v2.md).
🧭 Active product roadmap: [`mini-langfuse-plan-v3.md`](./docs/plans/mini-langfuse-plan-v3.md).

🚀 **Production deploy (Tencent / mlf.liuyidi.me)**: [`deploy/README.md`](./deploy/README.md).  
📜 **Historical Aliyun 三件套实录（已拆分，只读）**: [`docs/aliyun-ecs-demo-deploy.md`](./docs/aliyun-ecs-demo-deploy.md).  
bot / 落地页见 [minibot/deploy](https://github.com/liuyidi/minibot/tree/main/deploy)。

## Status

- ✅ **Milestone 1** — End-to-end minimum loop: ingestion API, trace/observation model, tree view UI, working Python SDK, demo script.
- ✅ **Milestone 2** — Generation cost calculation from built-in pricing table (OpenAI, Anthropic, Gemini); `@observe` decorator; `mini_langfuse.openai` drop-in wrapper; cost breakdown in UI.
- ✅ **Milestone 3** — Session aggregation view; background flusher thread (non-blocking, atexit-safe); UI sessions list + conversation timeline.
- ✅ **Milestone 4** — Score API + inline scoring UI (numeric / boolean / categorical); versioned Prompts with mutable `production` label pointer; SDK `create_prompt`, `get_prompt(name, label=...)`, `PromptClient.compile(vars)`; Prompt diff viewer in UI; Generation → PromptVersion link.
- ✅ **Milestone 5** — Docker Compose (local UI + API) + pytest suite covering ingestion idempotency, cost math, tree building, prompt label movement, score validation, SDK contextvar isolation, flusher fault tolerance, and prompt compile.
- ✅ **M7** — Waterfall chart on the trace detail page (three-column layout: Tree | Waterfall | Detail) with hover/select linked across all three panes.
- ✅ **M8** — Playground page: edit chat messages, auto-detect `{{variables}}`, run against mock / OpenAI / Anthropic providers, response with latency+tokens+cost, save-as-new-version dialog; every run is auto-persisted as a `playground:*` trace so it also shows up in Traces.

## Architecture

```
┌──────────────┐     HTTP     ┌──────────────┐         ┌────────────┐
│ Your Python  │ ── Basic ──▶ │  FastAPI     │ ──SQL──▶│  SQLite    │
│ app + SDK    │  ingestion   │  server      │         │  (or PG)   │
│              │              │              │         └────────────┘
│ • trace()    │              │ • auth       │
│ • @observe   │              │ • ingest     │
│ • .score()   │              │ • cost calc  │
│ • .get_prompt│              │ • tree build │
└──────────────┘              └──────┬───────┘
       ▲                             │
       │                       HTTP  │ REST
       │                             ▼
       │                     ┌──────────────┐
       └─── prompts ─────────│ React + Vite │
                             │ Tailwind SPA │
                             │ /traces /sessions /prompts
                             └──────────────┘
```

Queue-based tracing is now available as an optional data-plane path:

```
SDK / app -> FastAPI ingestion -> Redis Stream -> Python worker -> ClickHouse
                                ↘ PostgreSQL keeps control-plane data
```

Data model highlights:
- Observations are one **flat table** joined by `parent_observation_id` — allows partial updates and cheap tree reconstruction.
- Sessions are an aggregation view, not a table — no start/end ambiguity.
- Prompt `labels` (e.g. `production`) are **mutable pointers**; `version` is immutable. Promoting v2 to production auto-removes the label from v1.
- Ingestion is idempotent per event id and processed **per-event under SQLite savepoints** — one bad event doesn't fail the batch.

## Repo layout

```
mini-langfuse/
├── server/                # FastAPI backend
│   ├── app/               # models, schemas, api routes, services
│   ├── tests/             # pytest suite
│   └── Dockerfile
├── sdk-python/            # Python client SDK
│   ├── mini_langfuse/     # Client, decorators, flusher, openai wrapper, prompts
│   └── tests/
├── web/                   # React + Vite frontend
│   ├── src/               # pages, components, api client
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml     # local/dev only (Postgres + Redis + ClickHouse + worker)
├── .env.example           # local/dev env template
├── deploy/                # production (Tencent / mlf.liuyidi.me)
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── up.sh
│   └── tencent-nginx.conf
├── demo.py                # generates sample traces + prompts + scores
└── mini-langfuse-plan.md  # full design doc
```

## Quickstart — Docker (local / 5-minute path)

This is **not** how `mlf.liuyidi.me` is run. Production: [`deploy/README.md`](./deploy/README.md).

```bash
git clone https://github.com/liuyidi/mini-langfuse.git
cd mini-langfuse
docker compose up --build -d
```

- UI: http://localhost:8080
- API: http://localhost:8000  (health probe: http://localhost:8000/health)
- PostgreSQL, Redis, ClickHouse, and the worker are all started by `docker compose`.
- PostgreSQL data is persisted in the `mlf_pg` volume.
- ClickHouse data is persisted in the `mlf_clickhouse` volume.
- Ingestion defaults to the queue-first path when `MLF_INGESTION_QUEUE_URL` is set.
- Playground uses the built-in `mock` provider by default. To use real providers, pass keys through the compose env:
  `OPENAI_API_KEY=... ANTHROPIC_API_KEY=... docker compose up --build -d`

Then generate some traces (in a Python 3.10+ env):

```bash
cd sdk-python
pip install -e .
python ../demo.py
```

Reload the UI and you'll see 5 traces, a 3-turn session, 2 prompt versions with a `production` label, and 3 scores.

Demo credentials (hardcoded — override via `MLF_DEMO_PUBLIC_KEY` / `MLF_DEMO_SECRET_KEY`):
- `public_key = pk-lf-demo`
- `secret_key = sk-lf-demo`

## Local Queue Stack

If you want to run the queue-first ingestion path locally without the full UI stack:

```bash
docker compose up --build db redis clickhouse server worker
```

Useful local connection URLs:
- Redis: `redis://localhost:6379/0`
- ClickHouse HTTP: `http://localhost:8123`
- ClickHouse Native: `localhost:9000`

The worker reads from Redis Stream `mlf:ingestion` and writes to ClickHouse tables `default.traces` and `default.observations`.

## Quickstart — Dev mode (3 terminals, hot reload)

### 1. Backend

```bash
cd server
python -m venv .venv && source .venv/bin/activate
pip install -e '.[dev]'
uvicorn app.main:app --reload  # http://localhost:8000
```

The first run creates a SQLite DB at `server/mini_langfuse.db` and seeds a demo project.

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
pip install -e .
python ../demo.py
```

Open http://localhost:5173.

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

### Playground (M8)

Open any prompt (`/prompts/:name`) and click **"Open in Playground ▶"**. Edit chat messages, fill in `{{variables}}` that are auto-detected across all messages, pick a provider (mock / OpenAI / Anthropic) + model, and **Run** — response, latency, tokens, and cost appear in the right pane. Click **"Save as new version…"** to commit the edited prompt as v+1 (optionally with the `production` label).

Every playground run is persisted as a `playground:<prompt>` trace and shows up in the Traces list — so you can compare "manual runs vs. real user traffic" side by side.

Provider config:
- `mock` (default) — no API key, deterministic echo response for demos.
- `openai` — set `OPENAI_API_KEY` on the server container / process.
- `anthropic` — set `ANTHROPIC_API_KEY` on the server container / process.

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
| POST | `/api/public/playground/run` | Proxy an LLM call and record it as a `playground:*` trace |
| GET | `/health` | Liveness probe |

## SDK internals — background flushing

Since M3 the SDK no longer blocks on network. `Client._enqueue()` drops events into a bounded `queue.Queue`; a daemon thread batches them by size (default 50) or interval (1s) and POSTs to `/ingestion`. An `atexit` hook drains what's left when the interpreter exits, so short-lived scripts don't lose events. Ingestion failures are logged and swallowed — user code never sees them.

You can tune it:

```python
Client(pk, sk, batch_size=100, flush_interval=0.5)  # more aggressive
client.flush(timeout=5)  # block until queue drained (for tests / notebooks)
```

## Testing

```bash
# Server (fastapi + sqlalchemy, uses in-memory-ish SQLite):
cd server && pip install -e '.[dev]' && pytest

# SDK (no server required — uses a stubbed HTTP layer):
cd sdk-python && pip install -e . pytest && pytest
```

The server suite covers ingestion idempotency, tree building, cost math, prompt label movement, and score validation. The SDK suite covers contextvar isolation across nested spans, background flusher batching + fault tolerance, prompt variable substitution, and the async `@observe` path.

## Learn more

- Read the full plan: [`mini-langfuse-plan.md`](./mini-langfuse-plan.md)
- Real Langfuse: https://github.com/langfuse/langfuse
