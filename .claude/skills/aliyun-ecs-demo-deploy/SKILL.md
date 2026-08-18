---
name: aliyun-ecs-demo-deploy
description: >-
  Deploy mini-langfuse on Tencent Cloud (mlf.liuyidi.me). Use when the user
  asks to 发布、部署、更新 mlf、腾讯云、mlf.liuyidi.me、mlf-server、mlf-web.
  For bot.liuyidi.me / Aliyun minibot use the minibot repo skill instead.
---

# Tencent mini-langfuse Deploy（mlf only）

| 域名 | 服务 | 主机 |
|------|------|------|
| https://mlf.liuyidi.me | mini-langfuse | 腾讯云 `ubuntu@124.223.108.72` |

密钥：`mini-langfuse/deploy/tencent-mini-langfuse.pem`（已 gitignore）。  
Compose：`deploy/docker-compose.prod.yml` + `deploy/.env.prod`。  
Nginx：`deploy/tencent-nginx.conf`。

阿里云 ECS **不再跑** mlf；历史实录见 `docs/aliyun-ecs-demo-deploy.md`。

## SSH

```bash
ssh -i deploy/tencent-mini-langfuse.pem -o StrictHostKeyChecking=no ubuntu@124.223.108.72
```

远程操作默认 `required_permissions: ["all"]`。

## 更新

```bash
ssh -i deploy/tencent-mini-langfuse.pem -o StrictHostKeyChecking=no ubuntu@124.223.108.72 'set -euo pipefail
cd /path/to/mini-langfuse   # 以机上实际路径为准
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

1. 不要把 `.env.prod`、pem 写入 commit。
2. 不要在阿里云再起 `demo-mlf-*`。
3. minibot 上报只依赖运行时 `MINIBOT_SERVER_LANGFUSE_HOST=https://mlf.liuyidi.me`。
