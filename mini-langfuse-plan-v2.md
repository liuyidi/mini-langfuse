# Mini-Langfuse — 扩展方向计划 (M6+)

> 这份文档接续 [`mini-langfuse-plan.md`](./mini-langfuse-plan.md)。M1-M5 已完成，本文档规划**五个独立方向**，任意挑选、按需开工。方向之间不强依赖（少数依赖会显式标出），可以按你的兴趣或业务需要挑一个开始。
>
> 每个方向都给出：**为什么值得做 · 数据变更 · API 契约 · SDK 影响 · 前端影响 · 预计工作量 · 验收 demo**。粒度到"下一次坐下就能开工"。

## 快速对比

| 方向 | 主题 | 预计工作量 | 数据破坏性 | 依赖前置 | 推荐度 |
|---|---|---|---|---|---|
| **M6** | 真实用户 + 多项目 + API key | 3-4 天 | 高（几乎所有表加 project_id 已经有了，但要加真实 user/session cookie） | — | ⭐⭐⭐⭐⭐ |
| **M7** ✅ | 前端 waterfall 图 (**已完成**) | 1 天 | 无 | — | — |
| **M8** ✅ | Playground（编辑 prompt 实时试跑，**已完成**） | 2-3 天 | 小 | — | — |
| **M9** | PostgreSQL + Alembic 迁移 | 1-2 天 | 中（换 JSON 类型、加迁移历史） | — | ⭐⭐⭐ |
| **M10** | Streaming ingestion / SSE 实时 UI | 1-2 天 | 无 | — | ⭐⭐⭐ |

**建议顺序**：M7 → M9 → M6 → M10 → M8。理由：M7 快速见效不改数据；M9 换 Postgres 后 M6 的多租户改动更放心；M10 独立；M8 是最"产品化"的一步，做在最后。

---

## M6 — 真实用户 + 多项目 + API Key

### 为什么

现在 API key 是硬编码 `pk-lf-demo` / `sk-lf-demo`，所有 trace 都归到同一个 `demo_project_id`。这是 M1 快速原型的妥协。要模仿 Langfuse 的核心多租户模型，需要：
- 真实的 `users` 表 + 密码/OAuth 登录
- 一个 user 可以在多个 `organizations` 里，一个 org 可以有多个 `projects`
- 每个 project 可以生成多份 API key pair（`pk-...` + `sk-...`，后者只显示一次）
- 前端加登录页 + 项目切换器

### 数据变更

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,                    -- bcrypt / argon2；SSO 时可空
  name          TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE memberships (
  user_id TEXT REFERENCES users(id),
  org_id  TEXT REFERENCES organizations(id),
  role    TEXT NOT NULL,   -- OWNER / ADMIN / MEMBER / VIEWER
  PRIMARY KEY (user_id, org_id)
);

-- projects 表已存在，加一列
ALTER TABLE projects ADD COLUMN org_id TEXT REFERENCES organizations(id);

-- api_keys 已在 M1 设计但未实现；正式做
CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  public_key   TEXT UNIQUE NOT NULL,     -- pk-lf-xxxxx
  secret_hash  TEXT NOT NULL,            -- bcrypt(secret)
  note         TEXT,
  last_used_at TIMESTAMP,
  created_by   TEXT REFERENCES users(id),
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session cookies for UI logins
CREATE TABLE sessions_web (
  token       TEXT PRIMARY KEY,          -- HttpOnly cookie value
  user_id     TEXT NOT NULL,
  expires_at  TIMESTAMP NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

关键决定：
- **保留 `demo` 项目作为默认迁移目标**——升级后所有旧数据依然可见。
- **secret 只在创建时返回一次**；之后只能在 UI 上再生成。
- `require_project(...)` 依赖改为查 `api_keys` + 验 `bcrypt`。

### API 变更

新增：
| Method & Path | 说明 |
|---|---|
| POST `/auth/register` | 注册（email + password），首次注册者自动创建一个"默认 org + demo project"|
| POST `/auth/login` | 登录，Set-Cookie `mlf_session` |
| POST `/auth/logout` | 清 cookie |
| GET `/me` | 当前用户 + 所属 orgs + projects |
| POST `/orgs/:id/projects` | 建项目 |
| POST `/projects/:id/api-keys` | 生成新 key pair，返回明文 secret **一次** |
| DELETE `/projects/:id/api-keys/:key_id` | 撤销 |

现有 `/api/public/*` 保持 Basic auth 用 `api_keys` 验证；前端专用端点 `/api/ui/*` 用 cookie 认证（同一份 SQL 查询包一层）。

### SDK 影响

零。SDK 依然只关心 Basic auth 的 `pk/sk`。用户升级过来，只要在 UI 生成一份新的 key pair、替换 env 变量即可。

### 前端影响

- **登录 / 注册页**（两个表单）
- **项目切换器**：header 加下拉菜单，切换后调 `?projectId=` 传参或存到 cookie
- **Settings > API Keys**：列表 + 生成 + 撤销
- 所有列表页调用 `/api/ui/*`（走 cookie），拿当前项目

### 工作量

3-4 天：
- Day 1: DB schema + auth 服务（bcrypt、cookie）
- Day 2: API endpoints + `require_project` 改造
- Day 3: 前端登录/注册/项目切换/API keys 页
- Day 4: 迁移脚本 + docker-compose 更新 + tests

### 验收 demo

1. 注册新用户 Alice → 自动获得 org "Alice's org" + project "default"
2. 生成 API key pair，复制 pk/sk
3. SDK 用新 key 上报一条 trace，UI 里看到（只在这个项目下可见）
4. 邀请 Bob 加入 org 为 MEMBER，Bob 也能看到但不能建 key
5. 撤销 key → SDK 报 401

---

## M7 — 前端 Waterfall 图 ✅ (已完成)

### 为什么

M1 里我砍掉了瀑布图（时间轴甘特图），只保留了树 + 右侧 JSON。原 plan §6.2 描述：

> **中间瀑布图**：X 轴为绝对时间，每个 observation 一条水平色块；hover 显示 tooltip；点击选中。用简单 SVG/div 实现。

瀑布图对**性能问题**的可视化极有帮助——一眼看出"哪一步长、哪一步在等、哪一步跟其他并行"。目前只能靠时长数字脑补。

### 数据变更

无。已有的 `start_time` / `end_time` / `parent_observation_id` 就足够。

### API 变更

无。已有的 `/api/public/traces/:id` 返回全部信息。

### 前端影响

新增 `web/src/components/WaterfallChart.tsx`。核心思路：

1. 从 trace detail 拿到扁平化的 observations 列表（deep-first 顺序，方便和树对齐）
2. 计算总时间范围 `[minStart, maxEnd]`
3. 每个 observation 渲染成一个绝对定位的 `<div>`：
   - `left: (start - minStart) / totalDuration * 100%`
   - `width: (end - start) / totalDuration * 100%`
   - 颜色按 type 区分：SPAN=blue-400, GENERATION=purple-400, EVENT=neutral-400
4. 每行对应树里的一个节点，行高 24px。悬停显示 tooltip（时长、cost、model）
5. 点击同步选中右侧详情

放在 TraceDetailPage 里作为**第三栏**（或折叠到树上方作为顶部条带）。plan 里原本设计的三栏（左树 / 中瀑布 / 右详情）现在可以真正实现。

### 工作量

**1 天**：
- 上午：写 WaterfallChart 组件，纯 SVG 或 div 都行（推荐 div，Tailwind 好写）
- 下午：接进 TraceDetailPage；处理 hover/select 联动；handle 无 end_time 的"进行中"节点（虚线边框）

### 验收 demo

demo.py 已有的"Trace 2 agent-loop"里 span 时长各异（plan 0.05s / search 0.2s / book 0.08s）——瀑布图应该清晰画出这些块，还有 span 之间的间隙（"等待时间"）也一目了然。

---

## M8 — Playground（编辑 prompt 实时试跑） ✅ (已完成)

### 为什么

现在 prompt 管理是"读"的：能看到版本、diff、labels。**Playground 让 prompt 变成可编辑 + 可试跑**——这是 Langfuse 最"产品化"的功能之一。

用户流程：
1. 打开一个 prompt 的某版本
2. 编辑内容（chat messages 或 text）
3. 填入变量值（`{{name}}` = "Alice"）
4. 选一个 model + temperature
5. 点 "Run" → 服务器代理调用 OpenAI/Anthropic → 结果显示在旁边
6. 点 "Save as v3" 把编辑后的内容存为新版本

### 数据变更

轻。给 `prompt_versions` 加两列：

```sql
ALTER TABLE prompt_versions ADD COLUMN variables JSON;  -- ["name", "place"] declared vars
ALTER TABLE prompt_versions ADD COLUMN model_config JSON;  -- {model, temperature, ...}
```

这些其实可以塞进已有的 `config` JSON 字段——所以严格说数据无变更，只是约定 `config.variables` / `config.model` 的语义。

### API 变更

新增一个"proxy 到真实 LLM"的端点。有两种设计：

**方案 A：服务端持有 provider key**（推荐）
```
POST /api/ui/playground/run
Body: {
  provider: "openai" | "anthropic",
  model: "gpt-4o-mini",
  messages: [...],
  temperature: 0.7,
  max_tokens: 512
}
Response: { output: {...}, usage: {...}, latency_ms: 432 }
```

服务端从 env `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 拿 key，代理调用，把结果**同时也**作为一条 GENERATION 存入当前项目（trace name = "playground:<prompt-name>"）——这样在 Traces 页也能翻到 playground 的历史。

**方案 B：前端直接调用**  
省事但要暴露 key，不推荐。

依赖：M6 的 API key 系统能让每个 project 存自己的 provider key，更干净。M6 没做时，用全局 env 变量就行。

### SDK 影响

无（Playground 走浏览器 → 服务端 → provider，SDK 不参与）。

### 前端影响

新增 `pages/PromptPlaygroundPage.tsx`，从 `/prompts/:name/playground` 或 prompt detail 里的 "Try in Playground" 按钮进入。布局：

```
┌────────────────────────────────────────────────┐
│ [Prompt Name] v2  [Model: gpt-4o-mini ▼] [Run] │
├────────────────────────┬───────────────────────┤
│ Editor (messages)      │ Variables             │
│  system: [You are ...] │  name: [Alice]        │
│  user:   [Hi {{name}}] │  place: [Paris]       │
│  +add message          │                       │
├────────────────────────┴───────────────────────┤
│ Response                                        │
│  (streaming text appears here)                  │
│  latency: 432ms · tokens: 42/12 · cost: $0.001 │
├────────────────────────────────────────────────┤
│ [Save as new version…] [Save as production]    │
└────────────────────────────────────────────────┘
```

组件：
- `<PromptEditor />`：动态增删 message；`{{var}}` 高亮
- `<VariableInputs />`：从内容里自动 detect `{{name}}` 变量、列成输入框
- `<PlaygroundRunButton />`：调 `/playground/run`；SSE 流式回显（可选，先做非流式）
- `<PromptSaveDialog />`：新版本 commit message + labels

### 工作量

2-3 天：
- Day 1: 后端 provider 代理 + trace 写入
- Day 2: 前端编辑器 + variables + run
- Day 3: save-as-new-version + 流式（可选）

### 验收 demo

1. 打开 `customer-support` v2
2. 编辑 user message：`The customer asks: {{question}}` → 变成 `Customer: {{question}}. Reply politely.`
3. 变量 `question` = "Where's my order?"
4. Model 选 gpt-4o-mini，Run
5. 看到回复 + token/cost
6. Save as v3 → labels ["staging"]
7. Traces 页出现一条 `playground:customer-support` trace，包含这次调用

---

## M9 — PostgreSQL + Alembic

### 为什么

SQLite 在 dev / demo 环境非常好用，但生产上有硬伤：
- 并发写单线程锁（大量 concurrent ingestion 会退化）
- JSON 类型是 TEXT，查不方便
- 没有原生 array / GIN 索引
- 备份 / replication 需要额外方案

Postgres 是 Langfuse 官方选择。SQLAlchemy 层做得对，切换主要是**依赖 + 迁移 + JSON 类型换成 JSONB**。

Alembic 我在 M1 里跳过用了 `create_all`——够快但**生产上不能升级 schema**（M4 加 `prompt_version_id` 就是靠"删库重来"），是时候补上了。

### 数据变更

**JSON → JSONB**：全部 `JSON` 类型的 mapped_column 换成 `sqlalchemy.dialects.postgresql.JSONB`。JSONB 是二进制存储 + 建 GIN 索引，查询快。做法：

```python
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

# 兼容两边
JSONType = JSON().with_variant(JSONB(), "postgresql")

metadata_: Mapped[Optional[Any]] = mapped_column("metadata", JSONType)
```

**Alembic 初始化**：

```bash
cd server
alembic init alembic
# 编辑 alembic.ini: sqlalchemy.url = ${MLF_DATABASE_URL}
# 编辑 alembic/env.py: target_metadata = Base.metadata
alembic revision --autogenerate -m "initial"
alembic upgrade head
```

新增迁移文件夹 `server/alembic/versions/`。启动时 **不再** 调 `create_all()`，而是文档要求 `alembic upgrade head`（或 docker-compose 里加一个 init container）。

### API 变更

零。

### SDK 影响

零。

### 前端影响

零。

### docker-compose 变更

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: minilangfuse
      POSTGRES_USER: mlf
      POSTGRES_PASSWORD: mlf
    volumes:
      - mlf_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mlf"]
      interval: 5s

  server:
    depends_on:
      db: { condition: service_healthy }
    environment:
      MLF_DATABASE_URL: postgresql+psycopg://mlf:mlf@db:5432/minilangfuse
    command: sh -c "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"

volumes:
  mlf_pg:
```

保留 SQLite 支持——env 决定，本地开发依然可以用 SQLite。

### 工作量

1-2 天：
- 半天：加 alembic、生成 initial migration、docker-compose 加 postgres
- 半天：JSON → JSONB 变体、CI 里跑 pg + sqlite 双跑一遍
- 半天：SQL 里几处 `JSON_EXTRACT`（label 查询）用 `->>` / `?` 替代（`func.jsonb_array_elements` 或 `contains`）

### 验收 demo

- `docker compose up` 起 3 个容器（db, server, web），server 启动时看到 `Running upgrade  -> abc123, initial`
- SDK demo 依然工作
- 手动改一列，`alembic revision --autogenerate` 出新迁移，再 `upgrade head` 生效
- Postgres `\d observations` 显示 JSONB 类型的 input/output 列

---

## M10 — Streaming Ingestion / SSE 实时 UI

### 为什么

现在 UI 是"轮询式"：进 Trace 列表要刷新才看到新 trace。真实用户体验痛点：**"我刚打了一个请求，UI 里在哪？"** — 得手动刷新才看到。

Server-Sent Events (SSE) 让服务端主动推：SDK 一 flush，服务端立刻推给所有在看列表页的浏览器，UI 顶部弹出"1 new trace"badge。

### 数据变更

零。SSE 是纯 pub/sub，事件从 ingestion 流出去，DB 不新增表。

### 后端实现

轻。加一个内存 event bus：

```python
# app/services/event_bus.py
import asyncio
from collections import defaultdict

class EventBus:
    def __init__(self):
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)

    def publish(self, project_id: str, payload: dict) -> None:
        for q in self._subscribers[project_id]:
            q.put_nowait(payload)

    async def subscribe(self, project_id: str):
        q: asyncio.Queue = asyncio.Queue()
        self._subscribers[project_id].append(q)
        try:
            while True:
                yield await q.get()
        finally:
            self._subscribers[project_id].remove(q)

bus = EventBus()
```

`process_batch` 里在每次 commit 后调 `bus.publish(project_id, {"type":"trace_upserted","trace_id":...})`。

新增端点：
```python
@app.get("/api/ui/stream")
async def stream(project_id: str = Depends(require_project)):
    async def gen():
        async for event in bus.subscribe(project_id):
            yield f"data: {json.dumps(event)}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")
```

**注意**：内存 bus 只在**单进程**里工作。要支持多 uvicorn worker 或多机部署，需要换成 Redis pub/sub 或 Postgres LISTEN/NOTIFY。M10 先做内存版本，够 demo 和小规模用。

### 前端影响

TraceListPage / SessionListPage / TraceDetailPage 加 `EventSource`：

```tsx
useEffect(() => {
  const es = new EventSource("/api/ui/stream", { withCredentials: true });
  es.onmessage = (e) => {
    const evt = JSON.parse(e.data);
    if (evt.type === "trace_upserted") {
      queryClient.invalidateQueries({ queryKey: ["traces"] });
    }
  };
  return () => es.close();
}, []);
```

配合一个顶部 toast："2 new traces" 点击刷新。

### 工作量

1-2 天：
- 半天：EventBus + SSE endpoint + auth 复用
- 半天：前端 hook + toast + Nginx 配置（proxy `X-Accel-Buffering: no`，不然 SSE 会被缓冲）
- 半天：连通性测试（多 tab 同时看，SDK 推一条，两个 tab 都亮）

### 验收 demo

1. 打开两个浏览器 tab 到 http://localhost:8080
2. 命令行跑 `python demo.py`
3. 两个 tab 顶部都出现 "N new traces" badge
4. 点击自动刷新，列表更新

---

## 附：横切改动建议

无论你先做哪一个，这几个小改动都会让开发体验更好，**任何时候都能顺手做**：

1. **`alembic` 的替代方案**：如果你 M9 前还不想引入 Alembic，写个 `scripts/migrate.py` 手动对比 `Base.metadata` 和实际库，输出 `ALTER TABLE` SQL 到 stdout，比 `create_all()` 强不少。
2. **前端错误 boundary**：每个页面套一个 `<ErrorBoundary />`，避免一个坏字段导致白屏。
3. **API rate limiting**：`slowapi` 一个装饰器搞定，防止一个坏客户端把 ingestion 打爆。
4. **UI 里 traceId / observationId 一键复制**：现在只能选文本；加个 📋 按钮体验立刻好。

---

## 推荐首选：M7（Waterfall 图）

理由：**一天见效、零数据变更、观感升级最大**。做完后 UI 从"看树 + 数值"升级到"看图"，理解 trace 结构立刻直观。做完 M7 再考虑重的方向（M9 数据层 / M6 多租户）也不迟。

告诉我你想开哪一条，或者你想混合（比如 "M7 + M10 一起做，都是纯前端 + 少量后端"），我按你的选择开工。
