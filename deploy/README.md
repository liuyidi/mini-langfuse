# mini-langfuse 单机部署指南

本目录只负责 **生产** mini-langfuse（web + server + Postgres）：Docker Compose + 宿主机 Nginx HTTPS。  
生产机：**腾讯云** `124.223.108.72`，域名 `https://mlf.liuyidi.me`。

仓库根目录的 `docker-compose.yml` / `.env.example` 是 **本机开发**（含 Redis / ClickHouse / worker），不要在这台机器上 `docker compose up`。

> 迁移实录：[`../docs/tencent-lighthouse-mlf-migrate.md`](../docs/tencent-lighthouse-mlf-migrate.md)。  
> 阿里云旧三件套实录（只读）：[`../docs/aliyun-ecs-demo-deploy.md`](../docs/aliyun-ecs-demo-deploy.md)。

### 仓库边界

| 路径 | 内容 |
|------|------|
| `mini-langfuse/docker-compose.yml` | 本机 dev |
| `mini-langfuse/deploy/`（本目录） | **仅 mlf 生产** Compose / Nginx / `.env` 模板 |
| `minibot/deploy/` | minibot + `liuyidi.me` 落地页 + Aliyun nginx（bot / kb） |
| `minikb/deploy/` | minikb 独立部署 |

## 架构

```
Internet :443
    ↓
宿主机 Nginx (deploy/tencent-nginx.conf)
    ↓ 127.0.0.1:8080
mlf-web (静态 + /api 反代)
    ↓ Docker 内网
mlf-server :8000
    ↓
mlf-db (PostgreSQL，不暴露宿主机端口)
```

SDK / minibot 上报：`https://mlf.liuyidi.me/api/public/...`。

## 前置条件

- 腾讯云轻量（建议 4C4G+，Ubuntu 22.04 / 24.04）
- DNS：`mlf.liuyidi.me` → 本机公网 IP
- 安全组仅开放 **80、443**（以及 SSH 22）

## 1. 安装依赖

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录 shell

sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

## 2. 拉代码并配置环境变量

```bash
git clone <your-repo-url> mini-langfuse
cd mini-langfuse

cp deploy/.env.example deploy/.env
vim deploy/.env
```

（若机上仍是 `deploy/.env.prod`，`./deploy/up.sh` 会继续用它，方便时改名为 `.env`。）

必改项：

| 变量 | 说明 |
|------|------|
| `POSTGRES_PASSWORD` | 强密码，`openssl rand -hex 24` |
| `MLF_CORS_ORIGINS` | 公网地址，如 `https://mlf.liuyidi.me` |
| `MLF_OPENAI_API_KEY` | Playground / Evaluator 用（DeepSeek 等兼容 API） |

## 3. 启动服务

```bash
./deploy/up.sh
curl -s http://127.0.0.1:8000/health
```

## 4. 配置 Nginx + HTTPS

```bash
sudo cp deploy/tencent-nginx.conf /etc/nginx/sites-available/mini-langfuse
sudo ln -sf /etc/nginx/sites-available/mini-langfuse /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/certbot
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d mlf.liuyidi.me   # 首次；续期已有则跳过
```

浏览器访问 `https://mlf.liuyidi.me`，注册第一个账号（首个用户即管理员）。

## 5. 客户端接入

```bash
export LANGFUSE_HOST=https://mlf.liuyidi.me
export LANGFUSE_PUBLIC_KEY=pk-...
export LANGFUSE_SECRET_KEY=sk-...
```

minibot（阿里云）`.env`：

```env
MINIBOT_SERVER_LANGFUSE_HOST=https://mlf.liuyidi.me
MINIBOT_SERVER_LANGFUSE_PUBLIC_KEY=pk-...
MINIBOT_SERVER_LANGFUSE_SECRET_KEY=sk-...
```

## 运维命令

```bash
./deploy/up.sh
docker compose -f deploy/docker-compose.yml --env-file deploy/.env logs -f server
docker exec mlf-db pg_dump -U mlf minilangfuse > backup-$(date +%F).sql
```

## 故障排查

| 现象 | 检查 |
|------|------|
| 502 Bad Gateway | `docker ps` 确认 mlf-web 健康；`curl 127.0.0.1:8080` |
| CORS 错误 | `MLF_CORS_ORIGINS` 必须与浏览器地址完全一致（含 https） |
| SSE 不刷新 | Nginx `location /api/ui/stream` 是否 `proxy_buffering off` |
| Evaluator 500 | `MLF_OPENAI_API_KEY` / `MLF_OPENAI_BASE_URL` 是否配置 |
