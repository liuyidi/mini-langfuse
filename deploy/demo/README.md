# 面试 Demo：单机三件套（2C2G 可用）

在一台小 ECS 上同时跑 **mini-langfuse + minibot**，可选再加 **minikb**。

**完整上线实录（含全部踩坑）**：见仓库根目录 [`docs/aliyun-ecs-demo-deploy.md`](../../docs/aliyun-ecs-demo-deploy.md)。

## 架构

```
浏览器
  ├─ :8080  mini-langfuse UI  ──► server:8000
  ├─ :8766  minibot Dev UI    ──► 上报 trace → server:8000
  └─ :8081  minikb UI/API     （./up.sh kb）
         │
         ▼
   共用 postgres (pgvector)
   可选 minio（仅 kb profile）
```

内存预算（约）：Postgres 384 + server 384 + web 64 + minibot 384 ≈ **1.2GB**；再加 minikb+minio ≈ **1.8GB**。务必加 swap。

## 目录布局（ECS 推荐）

```bash
sudo mkdir -p /opt/demo && sudo chown "$USER" /opt/demo
cd /opt/demo

git clone <your-mini-langfuse-url> mini-langfuse
git clone <your-minikb-url> minikb
# minibot 在 nanobot 仓库里：
git clone <your-nanobot-url> nanobot
ln -sfn nanobot/minibot minibot
```

得到：

```
/opt/demo/
  mini-langfuse/
  minikb/
  minibot -> nanobot/minibot
  nanobot/
```

## 一键启动

```bash
# 1) swap（2C2G 强烈建议）
sudo bash mini-langfuse/deploy/demo/setup-swap.sh

# 2) 环境变量
cd mini-langfuse/deploy/demo
cp .env.example .env
vim .env   # 至少填 OPENAI_API_KEY；路径默认已按上面布局写好

# 3a) 最轻：langfuse + minibot（面试聊天 + Trace 够用）
./up.sh core

# 3b) 完整：再加 minikb + MinIO
./up.sh kb
```

## 访问地址

| 服务 | URL |
|------|-----|
| Langfuse | http://IP:8080/ |
| Minibot 聊天 | http://IP:8766/ui/ |
| Minikb | http://IP:8081/ui/ （需 `./up.sh kb`） |

演示路径建议：

1. 打开 minibot → 发一句消息  
2. 打开 Langfuse → Traces 看到刚产生的链路  
3.（可选）打开 minikb → 展示知识库 UI  

## 域名 + HTTPS（liuyidi.me 子域名）

完整逐步清单见 **[GUIDE-liuyidi.me.md](./GUIDE-liuyidi.me.md)**。

| 子域名 | 服务 |
|--------|------|
| https://mlf.liuyidi.me | Langfuse |
| https://bot.liuyidi.me | Minibot |
| https://kb.liuyidi.me | Minikb |

配置文件：`nginx-http-only.conf`（先 HTTP + Certbot）→ `nginx-subdomains.conf`（含 SSE）。

## 本地 Mac 路径

仓库若不在同级，改 `.env`：

```env
MLF_DIR=../..
MINIKB_DIR=/Users/you/ai/minikb
MINIBOT_DIR=/Users/you/ai/nanobot/minibot
```

## 运维

```bash
# 日志
docker compose -f docker-compose.yml --env-file .env logs -f minibot

# 停
docker compose -f docker-compose.yml --env-file .env --profile kb down

# 只重建 minibot
./up.sh core --force-recreate minibot
```

## 注意事项

1. **Demo only**：默认 `pk-lf-demo` / 弱密码 / 无鉴权，不要当正式生产。  
2. minikb 与 minibot 的知识库工具接线若尚未合并，`./up.sh kb` 仍可单独展示 minikb UI。  
3. 面试前预置数据，避免现场大文件上传 / 批量 embedding。  
4. 经济型 e 共享 CPU，冷启动可能慢，提前 `./up.sh` 预热。
