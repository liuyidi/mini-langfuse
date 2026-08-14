# 面试 Demo：单机两件套（2C2G 可用）

> **状态：历史 / 面试同机方案。**  
> 日常稳定跑 mlf 请改用上级目录的生产 Compose：[`../docker-compose.prod.yml`](../docker-compose.prod.yml) + [`../README.md`](../README.md)。  
> **minibot** 独立部署见 minibot 仓；**minikb** 在 Volcengine，见
> [minikb `.github/workflows/publish-volcengine-minikb.yml`](https://github.com/liuyidi/minikb/blob/main/.github/workflows/publish-volcengine-minikb.yml)。

在一台小 ECS 上同时跑 **mini-langfuse + minibot**。  
**minikb** 不在本机 compose：`kb.liuyidi.me` 由阿里云 Nginx TLS 终止后反代到 Volcengine `:8080`。

**完整上线实录**：[`docs/aliyun-ecs-demo-deploy.md`](../../docs/aliyun-ecs-demo-deploy.md)。

## 架构

```
浏览器
  ├─ :8080  mini-langfuse UI  ──► server:8000
  ├─ :8766  minibot Dev UI    ──► 上报 trace → server:8000
  └─ https://kb.liuyidi.me    ──► Aliyun nginx → Volcengine :8080
         │
         ▼
   共用 postgres (pgvector) — 仅 langfuse
```

内存预算（约）：Postgres 384 + server 384 + web 64 + minibot 512 ≈ **1.3GB**。务必加 swap。

## 目录布局（ECS 推荐）

```bash
sudo mkdir -p /opt/demo && sudo chown "$USER" /opt/demo
cd /opt/demo

git clone <your-mini-langfuse-url> mini-langfuse
git clone https://github.com/liuyidi/minibot.git minibot
```

```
/opt/demo/
  mini-langfuse/
  minibot/
```

## 一键启动

```bash
sudo bash mini-langfuse/deploy/demo/setup-swap.sh

cd mini-langfuse/deploy/demo
cp .env.example .env
vim .env   # OPENAI_API_KEY；MINIBOT_MINIKB_* 默认指向 https://kb.liuyidi.me

./up.sh core
```

## 访问地址

| 服务 | URL |
|------|-----|
| Langfuse | http://IP:8080/ |
| Minibot 聊天 | http://IP:8766/ui/ |
| Minikb | https://kb.liuyidi.me/ui/（Volcengine） |

## 域名 + HTTPS

完整清单见 **[GUIDE-liuyidi.me.md](./GUIDE-liuyidi.me.md)**。

| 子域名 | 服务 |
|--------|------|
| https://mlf.liuyidi.me | Langfuse（本机） |
| https://bot.liuyidi.me | Minibot（本机） |
| https://kb.liuyidi.me | Minikb（Nginx → Volcengine） |

配置：`nginx-subdomains.conf`（`upstream demo_kb` → `101.96.224.232:8080`）。

## 运维

```bash
docker compose -f docker-compose.yml --env-file .env logs -f minibot
docker compose -f docker-compose.yml --env-file .env down
./up.sh core --force-recreate minibot
```

## 注意事项

1. **Demo only**：默认 `pk-lf-demo` / 弱密码，不要当正式生产。  
2. 发布 minikb 只用 Volcengine workflow，不要在本机 `./up.sh kb`。  
3. 面试前预热 `./up.sh core`。
