---
name: deploying-tencent-mlf
description: >-
  Use when the user asks to 发布、部署、更新 mlf、腾讯云、mlf.liuyidi.me、
  mlf-server、mlf-web, or to ship mini-langfuse to Tencent Cloud. Not for
  bot.liuyidi.me, Aliyun compose, kb, auth, or serverless-ship.
---

# Tencent mini-langfuse Deploy（只 mlf）

应用已经拆开，**先选仓**。本 skill 只覆盖 mlf。

| 域名 | 仓 | 云 | Skill |
|------|----|----|-------|
| `liuyidi.me` / `bot.liuyidi.me` | minibot | 阿里云 ECS | minibot `aliyun-ecs-demo-deploy` |
| `kb.liuyidi.me` | minikb | 火山引擎 | minikb `deploying-volcengine-minikb` |
| `mlf.liuyidi.me` | mini-langfuse | 腾讯云 | **本文件** |
| `auth.liuyidi.me` | mini-auth | 腾讯云 CVM | mini-auth `deploying-tencent-mini-auth` |
| `serverless-ship.liuyidi.me` | serverless-ship | Vercel | serverless-ship `deploying-vercel-serverless-ship` |

## 硬性发布规则（必须遵守）

**所有部署必须：commit → `git push`（到 `main`）→ 由 GitHub Actions workflow 发布。**

- **允许**：commit / push；`gh run list` / `gh run watch`；验收公网 URL。
- **禁止**：本机 `ssh` / `rsync` / `scp` 同步代码；在机上手动 `git pull` + `./deploy/up.sh` 当发布路径；绕过 workflow 的热修。
- **例外**：用户明确要求只读排障（日志）且不是发版时，才可只读 SSH。代码上线仍走 push → workflow。
- **若仓库尚无 publish workflow**：不要回退到 SSH 发版；先补齐 `.github/workflows/` 发布流水线，再 push 触发。不要用「临时 SSH」代替 CI。

机上布局（供排障参考，非发布路径）：代码 `/opt/mlf/mini-langfuse`；compose `deploy/docker-compose.yml` + `deploy/.env`。

## Agent 发布步骤

```bash
git status -sb
git push -u origin HEAD

# 有正式 workflow 名后：
# gh workflow run "<Publish MLF workflow name>" --ref main
gh run list --limit 5
gh run watch
```

## 验收

```bash
curl -fsS -o /dev/null -w "%{http_code}\n" https://mlf.liuyidi.me/
```

## 约定

1. 不要把 `deploy/.env`、`.env.prod`、pem 写入 commit。
2. 不要在阿里云再起 `demo-mlf-*`。
3. minibot 上报只依赖 `MINIBOT_SERVER_LANGFUSE_HOST=https://mlf.liuyidi.me`。
4. 不要在这台腾讯云机上起 minibot / minikb / auth。
