# 阿里云 ECS 部署指南

单机 Docker Compose + 宿主机 Nginx HTTPS，适合小团队内网/公网试用。

> **面试 / 同机三件套 Demo**（mini-langfuse + minibot + 可选 minikb，2C2G）：见 [`demo/README.md`](./demo/README.md)。  
> **完整上线实录与踩坑**（liuyidi.me）：见 [`../docs/aliyun-ecs-demo-deploy.md`](../docs/aliyun-ecs-demo-deploy.md)。

## 架构

```
Internet :443
    ↓
宿主机 Nginx (deploy/aliyun-nginx.conf)
    ↓ 127.0.0.1:8080
mlf-web (静态 + /api 反代)
    ↓ Docker 内网
mlf-server :8000
    ↓
mlf-db (PostgreSQL，不暴露宿主机端口)
```

SDK / minibot 上报 trace：使用 `https://YOUR_DOMAIN/api/public/...`（经 Nginx → web → server）。

## 前置条件

- 阿里云 ECS（建议 2C4G+，Ubuntu 22.04 / Debian 12）
- 域名已解析到 ECS 公网 IP
- **大陆访问需 ICP 备案**（未备案只能用香港节点或内网）
- 安全组仅开放 **80、443**（以及 SSH 22）

## 1. 安装依赖

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录 shell

# Nginx + Certbot
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

## 2. 拉代码并配置环境变量

```bash
git clone <your-repo-url> mini-langfuse
cd mini-langfuse

cp deploy/.env.prod.example deploy/.env.prod
vim deploy/.env.prod
```

必改项：

| 变量 | 说明 |
|------|------|
| `POSTGRES_PASSWORD` | 强密码，`openssl rand -hex 24` |
| `MLF_CORS_ORIGINS` | 公网地址，如 `https://mlf.example.com` |
| `MLF_OPENAI_API_KEY` | Playground / Evaluator 用（DeepSeek 等兼容 API） |

## 3. 启动服务

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/docker-compose.prod.yml ps
curl -s http://127.0.0.1:8000/health
```

## 4. 配置 Nginx + HTTPS

```bash
# 把 YOUR_DOMAIN 替换成真实域名
sed "s/YOUR_DOMAIN/mlf.example.com/g" deploy/aliyun-nginx.conf | sudo tee /etc/nginx/sites-available/mini-langfuse
sudo ln -sf /etc/nginx/sites-available/mini-langfuse /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # 可选

sudo nginx -t
sudo certbot --nginx -d mlf.example.com
sudo systemctl reload nginx
```

浏览器访问 `https://mlf.example.com`，注册第一个账号（首个用户即管理员）。

## 5. 客户端接入

**Web UI**：直接访问域名。

**Python SDK / LangChain / minibot**：

```bash
export LANGFUSE_HOST=https://mlf.example.com
export LANGFUSE_PUBLIC_KEY=pk-...   # 项目 Settings → API Keys
export LANGFUSE_SECRET_KEY=sk-...
```

minibot `.env` 示例：

```env
MINIBOT_SERVER_LANGFUSE_HOST=https://mlf.example.com
MINIBOT_SERVER_LANGFUSE_PUBLIC_KEY=pk-...
MINIBOT_SERVER_LANGFUSE_SECRET_KEY=sk-...
```

## 运维命令

```bash
# 查看日志
docker compose -f deploy/docker-compose.prod.yml logs -f server

# 升级
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build

# 备份数据库
docker exec mlf-db pg_dump -U mlf minilangfuse > backup-$(date +%F).sql
```

## 安全建议

1. 不要将 `deploy/.env.prod` 提交到 Git（已在根 `.gitignore` 的 `.env` 规则下，建议 chmod 600）。
2. 生产环境尽快替换默认 demo API key，为每个项目单独发 key。
3. 单实例 SSE 为进程内总线；多副本需后续接 Redis pub/sub。
4. 数据量大时把 PostgreSQL 迁到阿里云 RDS，只改 `MLF_DATABASE_URL`。

## 故障排查

| 现象 | 检查 |
|------|------|
| 502 Bad Gateway | `docker ps` 确认 mlf-web 健康；`curl 127.0.0.1:8080` |
| CORS 错误 | `MLF_CORS_ORIGINS` 必须与浏览器地址完全一致（含 https） |
| SSE 不刷新 | Nginx `location /api/ui/stream` 是否 `proxy_buffering off` |
| Evaluator 500 | `MLF_OPENAI_API_KEY` / `MLF_OPENAI_BASE_URL` 是否配置 |
