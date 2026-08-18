---
name: deploying-tencent-mlf
description: >-
  Use when the user asks to 发布、部署、更新 mlf、腾讯云、mlf.liuyidi.me、
  mlf-server、mlf-web, or to ship mini-langfuse to Tencent Cloud. Not for
  bot.liuyidi.me, Aliyun compose, kb, auth, or serverless-ship.
---

# Tencent mini-langfuse Deploy（只 mlf）

应用已经拆开，**先选仓**。本 skill 只覆盖 mlf 行。

| 域名 | 仓 | 云 | Skill |
|------|----|----|-------|
| `liuyidi.me` / `bot.liuyidi.me` | minibot | 阿里云 ECS `root@116.62.35.76` | minibot `aliyun-ecs-demo-deploy` |
| `kb.liuyidi.me` | minikb | 火山引擎 | minikb `deploying-volcengine-minikb` |
| `mlf.liuyidi.me` | mini-langfuse | 腾讯云 `ubuntu@124.223.108.72` | **本文件** |
| `auth.liuyidi.me` | mini-auth | 腾讯云 CVM | mini-auth `deploying-tencent-mini-auth` |
| `serverless-ship.liuyidi.me` | serverless-ship | Vercel | serverless-ship `deploying-vercel-serverless-ship` |

密钥：`mini-langfuse/deploy/tencent-mini-langfuse.pem`（已 gitignore）。  
代码：`/opt/mlf/mini-langfuse`。Compose：`deploy/docker-compose.yml` + `deploy/.env`（机上若仍是 `.env.prod`，`up.sh` 会兼容）。  
Nginx：`deploy/tencent-nginx.conf`。不要用仓库根目录的 `docker-compose.yml`（那是本机 Redis/CH 开发栈）。

阿里云 ECS **不再跑** mlf；历史实录见 `docs/aliyun-ecs-demo-deploy.md`。

## SSH

```bash
ssh -i deploy/tencent-mini-langfuse.pem -o StrictHostKeyChecking=no ubuntu@124.223.108.72
```

远程操作默认 `required_permissions: ["all"]`。

## 更新

```bash
ssh -i deploy/tencent-mini-langfuse.pem -o StrictHostKeyChecking=no ubuntu@124.223.108.72 'set -euo pipefail
cd /opt/mlf/mini-langfuse
git fetch origin main && git reset --hard origin/main
./deploy/up.sh
curl -fsS http://127.0.0.1:8000/health
curl -fsS -o /dev/null -w "web %{http_code}\n" http://127.0.0.1:8080/
curl -fsS -o /dev/null -w "public %{http_code}\n" https://mlf.liuyidi.me/
'
```

## 验收

```bash
docker ps --filter name=mlf-
curl -fsS http://127.0.0.1:8000/health
curl -fsS -o /dev/null -w "%{http_code}\n" https://mlf.liuyidi.me/
```

## 约定

1. 不要把 `deploy/.env`、`.env.prod`、pem 写入 commit。
2. 不要在阿里云再起 `demo-mlf-*` 或 `demo-postgres`。
3. minibot 上报只依赖运行时 `MINIBOT_SERVER_LANGFUSE_HOST=https://mlf.liuyidi.me`。
4. 不要在这台腾讯云机上起 minibot / minikb / auth。
