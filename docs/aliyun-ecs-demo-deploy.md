# 阿里云 ECS 三件套 Demo 部署实录（liuyidi.me）

> **状态：历史只读。** `deploy/demo/` 已删除。  
> 当前：mlf → 腾讯云 [`deploy/README.md`](../deploy/README.md)；minibot + 落地页 → [minibot/deploy](https://github.com/liuyidi/minibot/tree/main/deploy)。  
> 迁移说明：[`tencent-lighthouse-mlf-migrate.md`](./tencent-lighthouse-mlf-migrate.md)。
>
> 以下记录 2026-07-27 在阿里云经济型 e（2C2G）上部署  
> **mini-langfuse + minibot**（可选 minikb）到 `https://mlf.liuyidi.me` / `https://bot.liuyidi.me` 的完整流程与踩坑。

---

## 1. 目标架构

```
浏览器
  https://mlf.liuyidi.me  → 宿主机 Nginx:443 → 127.0.0.1:8080 → mlf-web → server:8000
  https://bot.liuyidi.me  → 宿主机 Nginx:443 → 127.0.0.1:8766 → minibot
  https://kb.liuyidi.me   → 宿主机 Nginx:443 → 101.96.224.232:80 → Volcengine minikb
         │
         ▼
   Docker Compose（agent-demo）
   postgres(pgvector) + server + web + minibot
```

| 项 | 实际取值 |
|----|----------|
| 实例 | `ecs.e-c1m1.large`（2 vCPU / 2 GiB） |
| 系统 | Ubuntu 22.04 |
| 公网 IP | `116.62.35.76`（示例；以控制台为准） |
| 带宽 | 3 Mbps |
| 域名 | `liuyidi.me`（已 ICP 备案） |
| SSH | 密钥对 `agent.pem`，用户 `root` |

**结论**：2C2G 做面试 Demo 够用，但必须开 **swap**，并优先 `./up.sh core`（不要一上来就起完整 kb）。

---

## 2. 推荐流程（成功路径）

### 2.1 控制台准备

1. 安全组入方向：`22`（建议限源 IP）、`80`、`443`  
2. DNS A 记录：`mlf` / `bot` / `kb` → ECS 公网 IP  
3. 大陆机 + 域名：**先备案**再指望公网 80/443 用域名访问  

### 2.2 登录

```bash
chmod 600 ~/Downloads/agent.pem
ssh -i ~/Downloads/agent.pem root@<ECS_IP>
```

密钥来自创建实例时下载的 `.pem`，**阿里云不能再次下载私钥**。

### 2.3 安装 Docker（勿用 get.docker.com 硬扛）

大陆机执行 `curl https://get.docker.com | sh` 常卡在拉 `download.docker.com`。

**改用 Ubuntu 源：**

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git curl
sudo systemctl enable --now docker
```

配置阿里云镜像加速器（控制台「容器镜像服务」给出的专属地址）：

```bash
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://<你的ID>.mirror.aliyuncs.com",
    "https://docker.m.daocloud.io"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
docker info | grep -A5 "Registry Mirrors"
```

### 2.4 代码目录

```bash
mkdir -p /opt/demo && cd /opt/demo
git clone https://github.com/liuyidi/mini-langfuse.git mini-langfuse
git clone https://github.com/liuyidi/minikb.git minikb
git clone https://github.com/liuyidi/minibot.git nanobot   # monorepo，minibot 在子目录
ln -sfn nanobot/minibot minibot
```

**重要**：若 `deploy/`、Dockerfile 改动尚未 push，需从本机 `scp` 到 ECS。

### 2.5 Swap + 环境变量 + 启动

```bash
sudo bash /opt/demo/mini-langfuse/deploy/demo/setup-swap.sh

cd /opt/demo/mini-langfuse/deploy/demo
cp .env.example .env
# 至少设置：
#   POSTGRES_PASSWORD=
#   OPENAI_API_KEY=
#   OPENAI_BASE_URL=https://api.deepseek.com/v1
#   MLF_CORS_ORIGINS=https://mlf.liuyidi.me,https://bot.liuyidi.me

# Dockerfile.minibot 必须在 minibot build context 内
cp Dockerfile.minibot /opt/demo/minibot/Dockerfile.minibot

./up.sh core
```

自检：

```bash
curl -s http://127.0.0.1:8000/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
curl -s http://127.0.0.1:8766/health
```

### 2.6 Nginx + HTTPS

```bash
sudo cp /opt/demo/mini-langfuse/deploy/demo/nginx-http-only.conf \
  /etc/nginx/sites-available/liuyidi-demo
sudo ln -sf /etc/nginx/sites-available/liuyidi-demo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

curl -I http://mlf.liuyidi.me   # 期望 200

sudo certbot --nginx \
  -d mlf.liuyidi.me -d bot.liuyidi.me -d kb.liuyidi.me \
  --email <your@email> --agree-tos --redirect
```

验收：

```bash
curl -I https://mlf.liuyidi.me          # 200
curl -s -o /dev/null -w "%{http_code}\n" https://bot.liuyidi.me/ui/   # 200
# 注意：curl -I https://bot.liuyidi.me 可能返回 405（HEAD 未开放），属正常
```

浏览器：注册 Langfuse → minibot 聊天 → Traces 可见。

---

## 3. 踩坑清单（按发生顺序）

### 3.1 SSH「你的密钥.pem」从哪来？

- 创建 ECS 选「密钥对」时，浏览器**只下载一次**私钥（如 `agent.pem`）  
- 控制台只能看到密钥对名称，**不能再次下发私钥**  
- 丢了只能重置/换绑新密钥对  

### 3.2 `docker: command not found` / get.docker.com 卡住

| 现象 | 原因 | 处理 |
|------|------|------|
| 装完仍找不到 docker | 脚本未完成或未重登 | `apt install docker.io`；`usermod -aG docker` 后重登 |
| `get.docker.com` 卡在 `apt-get install docker-ce` | 大陆访问 Docker 官方 apt 源极慢 | `Ctrl+C`，改用 `apt install docker.io docker-compose-v2` |

### 3.3 拉镜像 `registry-1.docker.io` i/o timeout

```
failed to resolve reference "docker.io/pgvector/pgvector:pg16"
dial tcp ...:443: i/o timeout
```

**处理：**

1. 配置阿里云 `registry-mirrors`（见上文）  
2. compose 中基础镜像改为 DaoCloud 前缀，例如：  
   `docker.m.daocloud.io/pgvector/pgvector:pg16`  
3. 脚本：`deploy/demo/setup-docker-mirror.sh`  

> 镜像加速器只加速 **Docker Hub 拉镜像**，不解决容器内 `apt` / `pip` / `npm`。

### 3.4 构建卡在 `apt-get update`（deb.debian.org）

日志仍出现 `Hit:1 http://deb.debian.org/...`，说明 Dockerfile **未换成国内 apt 源**，或未重新 scp。

**处理：** 在 Dockerfile 里先 `sed` 成 `mirrors.aliyun.com`，再 `apt-get update`；pip 用阿里云 PyPI；npm 用 `registry.npmmirror.com`。

上传后务必确认：

```bash
grep mirrors.aliyun.com /opt/demo/mini-langfuse/server/Dockerfile
docker compose ... build --no-cache server   # 避免旧层缓存
```

### 3.5 `open Dockerfile.minibot: no such file or directory`

Compose 规定：`dockerfile` 路径相对 **build context**（`MINIBOT_DIR`），不是相对 `deploy/demo/`。

**处理：**

```bash
cp deploy/demo/Dockerfile.minibot /opt/demo/minibot/Dockerfile.minibot
```

`up.sh` 已增加自动 sync 逻辑（需把最新 `up.sh` 同步到 ECS）。

### 3.6 minibot hatch：`A second file ... SKILL.md`

`pyproject.toml` 里 `packages = ["src/minibot"]` 已包含 `skills/`，再 `force-include` 会重复打包。

**处理：** 删除 `[tool.hatch.build.targets.wheel.force-include]` 段；wheel 仍会带上 `static/` 与 `skills/`。

### 3.7 web 构建：`SessionDetailPage.tsx` TS2322

```
Type 'unknown' is not assignable to type 'ReactNode'
{(t.input || t.output) && (...)}  // 对象真值会变成 unknown 当 ReactNode
```

**处理：** 改为 `(t.input != null || t.output != null) && (...)`。

### 3.8 alembic：`is_active BOOLEAN DEFAULT 1`（Postgres）

```
column "is_active" is of type boolean but default expression is of type integer
```

SQLite 可用 `1`，Postgres 要用 `true`。

**处理：**  
`server/alembic/versions/2026_07_26_1300-004_eval_system.py`  
`server_default=sa.text('true')`，重建 server 镜像后重跑迁移。

### 3.9 `ModuleNotFoundError: No module named 'bcrypt'`

Dockerfile 手工列依赖时漏了 `bcrypt`（以及运行时需要的 `httpx`）。

**处理：** Dockerfile `pip install` 增加 `bcrypt>=4.1`、`httpx>=0.27`，与 `pyproject.toml` 对齐后重建 server。

### 3.10 Certbot：`Unable to register an account with ACME server`

大陆机访问 Let's Encrypt 偶发失败；稍后重试可能成功。备选：阿里云免费 SSL 手工安装。

成功后证书在：

```
/etc/letsencrypt/live/mlf.liuyidi.me/fullchain.pem
/etc/letsencrypt/live/mlf.liuyidi.me/privkey.pem
```

### 3.11 `curl -I https://bot.liuyidi.me` 返回 405

minibot 根路径不允许 HEAD；用 GET 测：

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://bot.liuyidi.me/ui/
```

### 3.12 `https://kb.liuyidi.me` 502

kb 已迁到 Volcengine；本机不再跑 `demo-minikb`。若 `https://kb.liuyidi.me` 502，检查 `upstream demo_kb` 与 Volcengine `:8080` / 安全组。

---

## 4. 运维速查

```bash
# 日志
docker compose -f /opt/demo/mini-langfuse/deploy/demo/docker-compose.yml \
  --env-file /opt/demo/mini-langfuse/deploy/demo/.env logs -f server

# 重建单个服务
cd /opt/demo/mini-langfuse/deploy/demo
docker compose -f docker-compose.yml --env-file .env build server
./up.sh core

# 改 CORS 后
docker compose -f docker-compose.yml --env-file .env up -d --force-recreate server

# 证书续期（certbot 一般已装 timer）
sudo certbot renew --dry-run
```

---

## 5. 相关文件

| 路径 | 说明 |
|------|------|
| `deploy/demo/docker-compose.yml` | Demo 编排（国内镜像、mem_limit） |
| `deploy/demo/up.sh` | 启动 + sync Dockerfile.minibot + 健康检查 |
| `deploy/demo/nginx-http-only.conf` | 先 HTTP，再交给 Certbot 加 SSL |
| `deploy/demo/nginx-subdomains.conf` | 子域名 HTTPS 参考 |
| `deploy/demo/setup-swap.sh` | 2G swap |
| `deploy/demo/setup-docker-mirror.sh` | 公共镜像加速（可与阿里云专属加速并存） |
| `deploy/demo/GUIDE-liuyidi.me.md` | 域名专项清单 |
| `deploy/demo/.env.example` | 环境变量模板 |

---

## 6. 最终验收清单

- [ ] `https://mlf.liuyidi.me` 可打开并注册登录  
- [ ] `https://bot.liuyidi.me/ui/` 可聊天（API Key 已配置）  
- [ ] Langfuse Traces 能看到 minibot 上报  
- [ ] `MLF_CORS_ORIGINS` 含 HTTPS 域名  
- [ ] swap 已开启；`docker ps` 中 core 容器 healthy  
- [ ] 安全组未暴露 5432 / 8000 / 8080 / 8766 到公网  

---

*本文档来自真实上线过程，后续若改 compose/Dockerfile，请同步更新本节踩坑表。*

## 附录：面试门户（2026-07-27）

设计见 [`superpowers/specs/2026-07-27-interview-demo-portal-design.md`](./superpowers/specs/2026-07-27-interview-demo-portal-design.md)。

| URL | 内容 |
|-----|------|
| `https://liuyidi.me` | Landing |
| `https://bot.liuyidi.me/` | nanobot WebUI |
| `https://bot.liuyidi.me/ui/` | DevUI |
| `https://mlf.liuyidi.me` | mini-langfuse |
| `https://kb.liuyidi.me` | minikb（Volcengine，经 Aliyun nginx） |

CI：`.github/workflows/deploy-demo.yml` + GitHub Secrets `ECS_*`。
