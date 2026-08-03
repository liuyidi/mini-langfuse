# Mini-Langfuse 实施计划

> 目标：从 0 手写一个"简版 Langfuse"，理解其原理，并配一个可视化界面（Trace 树、Generation 详情、Session 聚合、Prompt 版本、Score 评分）。
> 技术栈：**FastAPI (Python 3.11+) + SQLAlchemy + SQLite/Postgres** ；**React 18 + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query**。

---

## 1. Langfuse 的核心心智模型

Langfuse 本质上是一个**面向 LLM 应用的分布式追踪（tracing）系统**，套用了 OpenTelemetry 的思想，但对 LLM 场景做了特化。理解下面五个对象，就理解了它的大半：

| 对象 | 类比 | 说明 |
|---|---|---|
| **Trace** | 一次完整业务请求 | 用户点一次"提问按钮"产生的所有事情。是根节点。 |
| **Observation** | Span/Event | 一个 Trace 里发生的任何"可观测事件"。三种子类型： |
| ├─ **Span** | 一段耗时区间 | 例如"检索文档"、"重排"、"整体推理链路"。有 start/end。 |
| ├─ **Generation** | LLM 调用 | Span 的特化：额外记录 model / prompt / completion / usage / cost。 |
| └─ **Event** | 时间点事件 | 一次瞬时事件，没有结束时间。用得少。 |
| **Session** | 多轮会话 | 把属于同一个用户会话的多个 Trace 串起来（比如聊天对话）。 |
| **Score** | 评分 | 挂在 Trace 或 Observation 上的一个数值 / 分类 / 布尔评价（人工或自动）。 |
| **Prompt** | Prompt 模板 | 版本化的 prompt，Generation 可以引用具体版本号。 |

**关键关系**：
- Observation 之间通过 `parent_observation_id` 组成一棵树，根挂在 Trace 上。
- Trace 通过 `session_id` 可以聚合成一个 Session（Session 不是强实体，是聚合视图）。
- 数据是**追加写、异步批量上报**：SDK 在客户端 buffer 事件，走 `/ingestion` 批量接口打进来，服务端再落库 —— 这是 Langfuse 性能的关键设计，我们也照抄。

---

## 2. 数据模型 (SQLAlchemy / SQL)

用 SQLite 起步（零依赖），schema 保持与 Postgres 兼容，后期换 Postgres 只改连接串。所有主键用 **CUID2 / ULID** 字符串（前端友好、可排序）。时间字段全部存 UTC。

### 2.1 表结构

```sql
-- ============ project & auth（极简，先只做单项目单 key） ============
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_keys (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  public_key    TEXT UNIQUE NOT NULL,   -- pk-lf-xxx
  secret_hash   TEXT NOT NULL,          -- sk-lf-xxx 的哈希
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ 核心追踪表 ============
CREATE TABLE traces (
  id            TEXT PRIMARY KEY,        -- 客户端可指定，做幂等
  project_id    TEXT NOT NULL REFERENCES projects(id),
  name          TEXT,                    -- e.g. "chat-completion"
  user_id       TEXT,                    -- 业务侧用户
  session_id    TEXT,                    -- 会话聚合键
  input         JSON,                    -- 顶层输入
  output        JSON,                    -- 顶层输出
  metadata      JSON,
  tags          JSON,                    -- ["prod","v2"]
  release       TEXT,
  version       TEXT,
  timestamp     TIMESTAMP NOT NULL,      -- 客户端事件时间
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_traces_project_time ON traces(project_id, timestamp DESC);
CREATE INDEX idx_traces_session ON traces(session_id);
CREATE INDEX idx_traces_user ON traces(user_id);

CREATE TABLE observations (
  id                      TEXT PRIMARY KEY,
  trace_id                TEXT NOT NULL REFERENCES traces(id),
  parent_observation_id   TEXT REFERENCES observations(id),  -- 树结构
  type                    TEXT NOT NULL CHECK (type IN ('SPAN','GENERATION','EVENT')),
  name                    TEXT,
  start_time              TIMESTAMP NOT NULL,
  end_time                TIMESTAMP,
  status                  TEXT DEFAULT 'OK',        -- OK / ERROR
  status_message          TEXT,
  level                   TEXT DEFAULT 'DEFAULT',   -- DEBUG/DEFAULT/WARN/ERROR
  input                   JSON,
  output                  JSON,
  metadata                JSON,

  -- Generation 专属字段（type=GENERATION 时才有意义）
  model                   TEXT,
  model_parameters        JSON,          -- temperature/top_p/max_tokens...
  prompt_id               TEXT REFERENCES prompt_versions(id),  -- 引用哪个 prompt 版本
  prompt_tokens           INTEGER,
  completion_tokens       INTEGER,
  total_tokens            INTEGER,
  input_cost_usd          REAL,
  output_cost_usd         REAL,
  total_cost_usd          REAL,

  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_obs_trace ON observations(trace_id, start_time);
CREATE INDEX idx_obs_parent ON observations(parent_observation_id);
CREATE INDEX idx_obs_type ON observations(type);

-- ============ Score ============
CREATE TABLE scores (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  trace_id       TEXT NOT NULL REFERENCES traces(id),
  observation_id TEXT REFERENCES observations(id),   -- 可空：挂 trace 或某个 obs
  name           TEXT NOT NULL,                       -- "helpfulness"
  value          REAL,                                -- 数值分
  string_value   TEXT,                                -- 分类值
  data_type      TEXT NOT NULL,                       -- NUMERIC / CATEGORICAL / BOOLEAN
  source         TEXT NOT NULL,                       -- HUMAN / API / EVAL
  comment        TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_scores_trace ON scores(trace_id);

-- ============ Prompt 版本管理 ============
CREATE TABLE prompts (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  name         TEXT NOT NULL,                          -- "customer-support-v1"
  UNIQUE (project_id, name)
);

CREATE TABLE prompt_versions (
  id           TEXT PRIMARY KEY,
  prompt_id    TEXT NOT NULL REFERENCES prompts(id),
  version      INTEGER NOT NULL,                       -- 1,2,3...
  type         TEXT NOT NULL,                          -- 'text' | 'chat'
  content      JSON NOT NULL,                          -- 文本或 chat messages 数组
  config       JSON,                                   -- 变量占位、模型建议参数
  labels       JSON,                                   -- ["production","staging"]
  commit_msg   TEXT,
  created_by   TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (prompt_id, version)
);
```

### 2.2 派生视图 / 物化字段（性能优化，v2 再做）

真实 Langfuse 会把这些实时聚合成物化列以便列表页快速展示：
- `traces.duration_ms`：`MAX(obs.end_time) - trace.timestamp`
- `traces.total_cost`, `traces.total_tokens`：SUM of Generation
- `traces.observation_count`, `traces.error_count`

MVP 阶段先在查询时聚合，v2 用 trigger / 后台 worker 落库。

---

## 3. 目录结构

```
mini-langfuse/
├── README.md
├── docker-compose.yml          # 一键起后端 + 前端 + Postgres（可选）
├── .env.example
│
├── server/                     # FastAPI 后端
│   ├── pyproject.toml
│   ├── alembic/                # 数据库迁移
│   ├── app/
│   │   ├── main.py             # FastAPI 入口
│   │   ├── config.py           # 配置加载
│   │   ├── db.py               # engine / session / Base
│   │   ├── models/             # SQLAlchemy ORM
│   │   │   ├── trace.py
│   │   │   ├── observation.py
│   │   │   ├── score.py
│   │   │   └── prompt.py
│   │   ├── schemas/            # Pydantic
│   │   │   ├── ingestion.py    # 客户端事件的 union 类型
│   │   │   ├── trace.py
│   │   │   └── ...
│   │   ├── api/
│   │   │   ├── deps.py         # auth 依赖
│   │   │   ├── ingestion.py    # POST /api/public/ingestion
│   │   │   ├── traces.py       # 查询接口
│   │   │   ├── observations.py
│   │   │   ├── sessions.py
│   │   │   ├── scores.py
│   │   │   └── prompts.py
│   │   ├── services/
│   │   │   ├── ingestion.py    # 事件路由/幂等/upsert 核心逻辑
│   │   │   ├── cost.py         # 按 model 计算成本（内置价格表）
│   │   │   └── tree.py         # 构造 observation 树
│   │   ├── auth.py             # public/secret key 校验
│   │   └── seeds.py            # 生成 demo 数据
│   └── tests/
│       ├── test_ingestion.py
│       └── test_query.py
│
├── sdk-python/                 # 简版 Python SDK（照抄 langfuse-sdk 骨架）
│   ├── pyproject.toml
│   └── mini_langfuse/
│       ├── __init__.py
│       ├── client.py           # 单例 Client
│       ├── models.py           # Trace/Span/Generation 数据类
│       ├── context.py          # contextvars 维护当前 trace/span
│       ├── decorators.py       # @observe / @generation
│       ├── flusher.py          # 后台线程批量 flush
│       └── openai_wrapper.py   # 可选：openai.ChatCompletion patch
│
└── web/                        # React 前端
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/                # fetch 封装 + TanStack Query hooks
        │   ├── client.ts
        │   ├── traces.ts
        │   └── prompts.ts
        ├── pages/
        │   ├── TraceListPage.tsx
        │   ├── TraceDetailPage.tsx        # 核心页
        │   ├── SessionListPage.tsx
        │   ├── SessionDetailPage.tsx
        │   ├── PromptListPage.tsx
        │   ├── PromptDetailPage.tsx       # diff 版本
        │   └── ScoresPage.tsx
        ├── components/
        │   ├── TraceTree.tsx              # 树形 + 缩进 + 时间条
        │   ├── WaterfallChart.tsx         # 甘特/瀑布图
        │   ├── ObservationDetail.tsx      # 右侧详情抽屉
        │   ├── JsonViewer.tsx
        │   ├── DiffViewer.tsx             # prompt diff
        │   └── ScoreBadge.tsx
        └── lib/
            ├── time.ts
            └── cost.ts
```

---

## 4. API 契约

采纳 Langfuse 官方风格：**`/api/public/*` 走 basicAuth (publicKey:secretKey)**。

### 4.1 Ingestion（写入，核心）

`POST /api/public/ingestion`

Request body:
```jsonc
{
  "batch": [
    {
      "id": "evt_01H...",           // 事件 ID，用于幂等
      "type": "trace-create",       // trace-create | span-create | span-update
                                    // generation-create | generation-update
                                    // event-create | score-create
      "timestamp": "2026-07-24T10:00:00Z",
      "body": {
        // 具体对象字段，见 §2 数据模型
      }
    },
    ...
  ]
}
```

服务端逻辑：
1. 校验 API key。
2. 遍历 batch，按 `type` 分派到 upsert handler。
3. `*-create` 采用 `INSERT ... ON CONFLICT (id) DO NOTHING`；`*-update` 用部分字段合并。
4. Generation 收到 usage 时，查内置价格表算 cost 写入。
5. 返回每条事件的 `{id, status: "success" | "error", message}`。

响应 **207 Multi-Status**，一条失败不阻塞其它。

### 4.2 查询

| Method & Path | 用途 |
|---|---|
| `GET /api/public/traces?userId=&sessionId=&fromTimestamp=&limit=&page=` | 列表，含聚合列（cost/tokens/duration） |
| `GET /api/public/traces/{trace_id}` | 详情：trace + 全部 observations（已构造成树） |
| `GET /api/public/observations/{id}` | 单个 observation 详情（大 payload 懒加载用） |
| `GET /api/public/sessions?userId=&limit=` | Session 列表（distinct session_id 聚合） |
| `GET /api/public/sessions/{session_id}` | Session 详情 = 该 session 下按时间排序的 traces |
| `GET /api/public/scores?traceId=` | Score 列表 |
| `POST /api/public/scores` | 手工/UI 打分 |
| `GET /api/public/prompts` | Prompt 列表 |
| `GET /api/public/prompts/{name}?version=&label=production` | 获取指定版本（label 优先） |
| `POST /api/public/prompts` | 新建 Prompt 或提交新版本（version 自增） |

### 4.3 前端专用端点（不走 public auth，走 session cookie，v2 再做）

MVP 直接复用 public API。

---

## 5. Python SDK 设计

SDK 是"用户实际写代码时接触到的东西"，是产品好不好用的关键。核心模式：**contextvars 维护当前 span 栈 + 后台线程批量 flush**。

### 5.1 用户接口

```python
from mini_langfuse import Client, observe

client = Client(
    public_key="pk-lf-xxx",
    secret_key="sk-lf-xxx",
    host="http://localhost:8000",
)

# 方式一：装饰器
@observe(name="rag-pipeline")             # 创建 span（或 trace，若无父）
def answer(question: str) -> str:
    ctx = retrieve(question)
    return generate(question, ctx)

@observe()
def retrieve(q: str) -> list[str]:
    ...

@observe(as_type="generation", model="gpt-4o-mini")
def generate(q: str, ctx: list[str]) -> str:
    # 返回值自动作为 output；参数自动作为 input
    resp = openai.chat.completions.create(...)
    # 装饰器从 resp.usage 抽 token/cost
    return resp.choices[0].message.content

# 方式二：显式 API
with client.trace(name="chat", user_id="u1", session_id="s1") as trace:
    with trace.span(name="retrieve") as span:
        docs = retrieve()
        span.update(output=docs)

    with trace.generation(name="llm", model="gpt-4o") as gen:
        resp = call_llm()
        gen.update(
            input=prompt, output=resp.text,
            usage={"prompt_tokens": 12, "completion_tokens": 34},
        )
```

### 5.2 内部实现要点

- `context.py` 使用 `contextvars.ContextVar` 保存当前 trace_id 和 observation 栈；协程/线程安全。
- 所有 `.update()` / 生命周期结束把事件放入 `queue.Queue`。
- `flusher.py` 在后台线程每 `flush_interval=1s` 或队列满 `batch_size=50` 时打包 POST。
- 进程退出时注册 `atexit` 保证 flush；SDK 报错**不能**影响用户主逻辑（try/except 吞掉 + 日志）。
- `@observe` 通过 `inspect.signature` 抓参数当 input，返回值当 output，异常时写 `status=ERROR`。
- 内置 `openai_wrapper`：`from mini_langfuse.openai import openai` 一行替换，自动包所有 chat.completions 调用。

---

## 6. 前端页面规划

用 shadcn/ui + Tailwind。数据全靠 TanStack Query 缓存。

### 6.1 Trace 列表页 `/traces`

- 顶栏：时间范围、user_id / session_id / tags / name 过滤、搜索。
- 表格列：Time · Name · User · Session · Latency · Total tokens · Cost · Scores · Error?
- 点行 → 打开详情。

### 6.2 Trace 详情页 `/traces/:id` （**核心可视化页**）

三栏布局：
1. **左侧树** `<TraceTree />`：
   - 缩进树，节点渲染 `[SPAN|GEN|EVENT] name  |  120ms  |  $0.0012`。
   - 有子节点可折叠；错误节点红色高亮。
2. **中间瀑布图** `<WaterfallChart />`：
   - X 轴为绝对时间，每个 observation 一条水平色块；hover 显示 tooltip；点击选中。
   - 用简单 SVG/div 实现，不用重量级图表库。
3. **右侧详情** `<ObservationDetail />`：
   - 选中节点的 input/output（JSON viewer，长文本折叠 + 高亮）。
   - Generation 额外显示：model、参数、token 明细条、cost、Prompt 引用（点击跳版本页）。
   - 底部 "Scores" tab：显示该 obs / trace 上的分数，可现场加分。

**为什么这么设计**：Langfuse 本尊也是这个三栏，一眼理清"哪一步慢、哪一步贵、哪一步炸"。

### 6.3 Session 详情页 `/sessions/:id`

- 顶部 metadata：user、trace 数、总 cost、时间跨度。
- 时间线上罗列该 session 内 traces（每个 trace 类似聊天气泡卡片）。
- 支持在同一页展开某个 trace 的 tree（复用 TraceTree 组件）。

### 6.4 Prompts 页 `/prompts` `/prompts/:name`

- 列表：name、最新版本、labels、更新时间。
- 详情：版本选择下拉；两版本 diff（左右对照，`<DiffViewer />`）；右侧 "used by" 列出最近 N 个引用此版本的 generations。

### 6.5 Scores 页 `/scores`

- 分数分布直方图 + 表格；用于快速看数据集质量。

---

## 7. 分阶段实施路线图

**每一阶段结束都要有能跑起来的 demo。** 不要一次性做完再联调。

### Milestone 1 — 端到端最小闭环 (预计 2-3 天)
- FastAPI 项目骨架 + SQLite + Alembic 初始迁移（traces、observations 两张表）。
- `POST /ingestion` 只支持 `trace-create` 和 `span-create`。
- Python SDK 最小版：`Client` + `trace()` + `span()` context manager + 同步 flush（先不搞后台线程）。
- React 项目骨架；只做 Trace 列表 + Trace 详情（左侧树 + 右侧原始 JSON）。
- **验收 demo**：写一个 `demo.py` 手工建一个嵌套 span 的 trace，前端能看到树。

### Milestone 2 — Generation & 成本 (2 天)
- 加 `GENERATION` 类型：model、tokens、cost。
- 内置价格表 `pricing.yaml`（gpt-4o、gpt-4o-mini、claude-*、gemini-* 各价一行）。
- SDK 加 `generation()` + `@observe(as_type="generation")` + `openai_wrapper`。
- 前端详情页显示 token/cost；列表页聚合 duration/cost。
- **验收 demo**：接真的 OpenAI 调用，UI 显示成本 & token。

### Milestone 3 — Session & 后台 Flush (1-2 天)
- SDK 后台线程批量 flush + atexit 保证。
- `user_id` / `session_id` 支持。
- Session 列表 + 详情页。
- **验收 demo**：模拟多轮对话，Session 视图能把多 trace 串起来。

### Milestone 4 — Score & Prompt 版本管理 (2-3 天)
- Score 表 + `POST /scores`；详情页可打分。
- Prompt / PromptVersion 表；`POST /prompts` 版本自增；`label=production` 逻辑。
- SDK `client.get_prompt("name", label="production")` 返回可格式化对象；Generation 上报时可关联 `prompt_id`。
- 前端 Prompt 页 + Diff 组件。
- **验收 demo**：新建 prompt v1 → 打 production label → SDK 拉取使用 → trace 里显示引用版本 → 手工评分。

### Milestone 5 — 打磨 & 部署 (1-2 天)
- Docker-compose（可选 Postgres）；一键起。
- README 含架构图、5 分钟 quickstart。
- 关键单测：ingestion 幂等、tree 构造、cost 计算、SDK 上下文隔离。
- 可选加分项：搜索（trace 内 input/output 全文）、SSE 实时推送新 trace、Playground。

---

## 8. 学到的原理清单（做完你会理解）

- 为什么追踪系统要**幂等 + 批量**（网络失败、事件乱序）。
- 为什么 SDK 要**contextvars** 而不是全局变量（多协程/并发）。
- Trace 树是**扁平表 + parent_id** 而不是嵌套 JSON —— 便于查询、更新单节点。
- Prompt 版本化的核心：**label 是可变指针，version 是不可变**。
- 成本估算为什么必须服务端做（客户端算容易被漂移的价目表坑）。
- Session 为什么是"聚合视图"而不是实体表：**避免会话开始/结束的定义扯皮**。

---

## 9. 你现在可以立刻开始的第一个动作

```bash
mkdir mini-langfuse && cd mini-langfuse
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn sqlalchemy alembic pydantic-settings python-multipart
mkdir -p server/app/{models,schemas,api,services} sdk-python web
cd server && alembic init alembic
```

然后按 Milestone 1 的清单，先把 `POST /ingestion` 打通到 SQLite —— 这是整个系统的心脏，先让它跳起来。
