# 迁移指南：mini-langfuse → 腾讯云轻量（4C4G）

> 目标：把 **仅 mini-langfuse**（web + server + Postgres）从阿里云「三件套同机 Demo」迁到腾讯云轻量应用服务器。  
> 规格参考：`4 核 4G / 3M 峰值带宽 / 40GB SSD / 300GB 月流量`。  
> 日期：2026-08-03

相关文档：

| 文档 | 用途 |
|------|------|
| [`../deploy/README.md`](../deploy/README.md) | **mlf 单机生产** Compose + Nginx（本迁移的目标形态） |
| [`../deploy/demo/`](../deploy/demo/) | **历史** 面试三件套（mlf+bot+kb 同机），不再作为 mlf 主路径 |
| [`aliyun-ecs-demo-deploy.md`](./aliyun-ecs-demo-deploy.md) | 阿里云 2C2G 三件套上线实录（只读参考） |

**仓库边界（后续约定）**

- `mini-langfuse/deploy/` → 只维护 **mini-langfuse** 部署
- `minibot/deploy/` → minibot / WebUI 独立部署文档（新建）
- `minikb/deploy/` → minikb 独立部署文档（新建）

---

## 1. 为什么迁

| 现状（阿里云 2C2G） | 问题 |
|---------------------|------|
| mlf + minibot + minikb + 共用 PG | 内存紧、靠 swap；SQLAlchemy 连接池易打满 |
| `deploy/demo` 三件套 | 故障域绑死：bot 狂写 / kb 吃内存会拖死 mlf UI |

迁移后：

```text
腾讯云 4C4G（新）              阿里云 2C2G（旧，可保留）
┌─────────────────────┐       ┌─────────────────────┐
│ nginx :443          │       │ nginx :443          │
│ mlf-web :8080       │       │ minibot :8766       │
│ mlf-server :8000    │◄─SDK──│ (+ 可选 minikb)     │
│ mlf-db (Postgres)   │       │                     │
└─────────────────────┘       └─────────────────────┘
        ▲
   https://mlf.liuyidi.me  （DNS 切到腾讯公网 IP）
```

---

## 2. 资源预算（4C4G 单跑 mlf）

| 组件 | 建议 mem_limit | 说明 |
|------|----------------|------|
| Postgres | 1～1.5 GiB | 远好于 demo 的 384Mi |
| mlf-server | 512 MiB～1 GiB | `MLF_UVICORN_WORKERS=2` 可接受 |
| mlf-web | 64～128 MiB | nginx 静态 |
| 系统余量 | ≥1 GiB | 勿再塞 bot/kb |

磁盘 40G：个人 / 面试 trace 量通常够用；注意 `pg_dump`、Docker 镜像与日志增长。  
流量 300GB/月 + 3M：低频 UI + SDK ingest 够用。

连接池（生产 compose）：可把 `pool_size` / `max_overflow` 提到约 `10+20`（需改 `server/app/db.py` 或后续加 env）；迁移当天先用默认也可。

---

## 3. 迁移步骤（推荐顺序）

### 3.1 腾讯云控制台

1. 购买轻量：Ubuntu 22.04 / 24.04，记下 **公网 IP**、SSH 密钥或密码。
2. 防火墙放行：**22**（限源 IP）、**80**、**443**。
3. **不要**对公网开放 5432 / 8000 / 8080。

### 3.2 新机装依赖

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git curl
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # 重新登录后生效
```

国内拉镜像慢时配置镜像加速（腾讯云 / DaoCloud 等），再 `systemctl restart docker`。

### 3.3 拉代码并只起 mlf

使用 **生产 compose**（不是 `deploy/demo`）：

```bash
sudo mkdir -p /opt/mlf && sudo chown "$USER" /opt/mlf
cd /opt/mlf
git clone git@github.com:liuyidi/mini-langfuse.git
# 或 HTTPS / ghfast 镜像

cd mini-langfuse
cp deploy/.env.prod.example deploy/.env.prod
chmod 600 deploy/.env.prod
```

编辑 `deploy/.env.prod`：

| 变量 | 示例 |
|------|------|
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `MLF_CORS_ORIGINS` | `https://mlf.liuyidi.me`（切 DNS 后的最终域名） |
| `MLF_UVICORN_WORKERS` | `2` |
| `MLF_OPENAI_*` | 按需（Playground / Evaluator） |

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
curl -fsS http://127.0.0.1:8000/health
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
```

### 3.4（可选）从旧机迁数据

旧机（阿里云）备份：

```bash
# 旧 demo 栈容器名多为 demo-postgres；库名以实际为准（常为 minilangfuse）
ssh -i ~/Downloads/agent.pem root@<旧ECS> \
  'docker exec demo-postgres pg_dump -U demo minilangfuse' > mlf-backup-$(date +%F).sql
```

新机导入（容器名 `mlf-db`，用户/库见 `.env.prod`）：

```bash
# 先确保 compose 已启动且 db healthy
cat mlf-backup-YYYY-MM-DD.sql | docker exec -i mlf-db \
  psql -U mlf -d minilangfuse
```

若账号体系、API Key 要原样保留，必须做这一步；否则可空库重新注册（更干净，但历史 trace 丢失）。

### 3.5 Nginx + HTTPS

```bash
sed "s/YOUR_DOMAIN/mlf.liuyidi.me/g" deploy/aliyun-nginx.conf \
  | sudo tee /etc/nginx/sites-available/mini-langfuse
sudo ln -sf /etc/nginx/sites-available/mini-langfuse /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
```

**先**把 DNS `mlf.liuyidi.me` A 记录改为腾讯公网 IP（TTL 可临时调短），生效后：

```bash
sudo certbot --nginx -d mlf.liuyidi.me
sudo systemctl reload nginx
curl -fsS -o /dev/null -w "%{http_code}\n" https://mlf.liuyidi.me/
```

备案域名在腾讯云使用：域名已备案即可解析到腾讯机；若控制台有「域名关联 / 备案接入」提示，按轻量要求操作。

### 3.6 切换客户端

本地 / 阿里云上的 minibot `.env`：

```env
MINIBOT_SERVER_LANGFUSE_ENABLED=true
MINIBOT_SERVER_LANGFUSE_HOST=https://mlf.liuyidi.me
MINIBOT_SERVER_LANGFUSE_PUBLIC_KEY=pk-...
MINIBOT_SERVER_LANGFUSE_SECRET_KEY=sk-...
```

重启 minibot 后打一条对话，在新 mlf UI 确认出现 trace。

### 3.7 旧机收尾

1. 确认新站稳定（建议观察 24h）。
2. 阿里云 compose **停掉 mlf 相关服务**（`demo-mlf-server` / `demo-mlf-web`），保留 minibot（+ 可选 minikb）。
3. 旧机 Nginx 去掉 `mlf.liuyidi.me` server 块，避免误导；`bot` / `kb` 域名可继续指旧机。
4. 旧 PG 里的 minilangfuse 库可保留一段时间再删。

---

## 4. 验收清单

```bash
# 新机
curl -fsS http://127.0.0.1:8000/health
curl -fsS -o /dev/null -w "web %{http_code}\n" http://127.0.0.1:8080/
curl -fsS -o /dev/null -w "https %{http_code}\n" https://mlf.liuyidi.me/
docker stats --no-stream
free -h
```

- [ ] UI 可登录 / 注册
- [ ] SDK / minibot ingest 成功
- [ ] SSE（实时刷新）正常
- [ ] 旧机 bot.liuyidi.me 仍可用
- [ ] DNS 仅 `mlf` 指向腾讯；`bot`/`kb` 仍指向阿里（若保留）

---

## 5. 常见坑

| 现象 | 处理 |
|------|------|
| Certbot 失败 | DNS 未生效或 80 未放行 |
| CORS | `MLF_CORS_ORIGINS` 必须与浏览器 origin 完全一致 |
| 502 | `docker ps`；`curl 127.0.0.1:8080` |
| 镜像拉取超时 | Docker registry mirror；重试 build |
| 迁库后登录失败 | 确认导入的是同一库；cookie 域仍是 `mlf.liuyidi.me` |
| 连接池再次打满 | 查 `idle in transaction`；重启 server；后续再调大 pool |

---

## 6. 不在本次范围

- 不把 minibot / minikb 迁到腾讯 4C4G（避免再次合部署挤爆）。
- 不购买 RDS MySQL（本项目是 **PostgreSQL**）。
- 三件套同机文档仍留在 `deploy/demo/`，仅作历史 / 面试 Demo；新环境请用本指南 + `deploy/docker-compose.prod.yml`。
