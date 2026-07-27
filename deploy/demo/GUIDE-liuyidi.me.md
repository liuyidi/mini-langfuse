> **完整上线实录（含全部踩坑）**：见仓库 [`docs/aliyun-ecs-demo-deploy.md`](../docs/aliyun-ecs-demo-deploy.md)。

# 域名 liuyidi.me 上线清单（ECS + HTTPS）

目标：浏览器打开 **https://mlf.liuyidi.me**、**https://bot.liuyidi.me**（可选 **https://kb.liuyidi.me**）。

---

## DNS（阿里云解析）

| 主机记录 | 类型 | 值 |
|----------|------|-----|
| `@` | A | ECS 公网 IP |
| `www` | A | ECS 公网 IP |
| `mlf` | A | ECS 公网 IP |
| `bot` | A | ECS 公网 IP |
| `kb` | A | ECS 公网 IP |

门户：`https://liuyidi.me`（静态页 `deploy/demo/landing/`）。

## GitHub → ECS 自动部署

仓库已含 `.github/workflows/deploy-demo.yml`。在 GitHub → Settings → Secrets 配置：

| Secret | 含义 |
|--------|------|
| `ECS_HOST` | 公网 IP |
| `ECS_USER` | `root` 或 `ubuntu` |
| `ECS_SSH_KEY` | 私钥全文（与登录 ECS 同一把） |
| `ECS_DEMO_DIR` | 可选，默认 `/opt/demo` |

ECS 上各仓库需已 clone，且 `deploy/demo/.env` 已存在。push `main`（触及 deploy/server/web）即触发 `./up.sh core`。

minikb：`./up.sh kb`（需内存；面试前预热）。

---

## 0. 先确认两件事

### A. ECS 在哪个地域？

| 地域 | 域名要求 |
|------|----------|
| **香港 / 海外** | 买完域名即可，直接解析 |
| **中国大陆** | 域名必须先完成 **ICP 备案**，否则 80/443 可能被拦截 |

未备案又买了大陆机：先用 `http://公网IP:8080` 验证应用，备案完成后再上 HTTPS。

### B. 记下 ECS 公网 IP

阿里云控制台 → ECS → 实例 → **公网 IP**（下文写作 `YOUR_ECS_IP`）。

---

## 1. 域名 DNS 解析（阿里云域名控制台）

打开 [云解析 DNS](https://dns.console.aliyun.com/) → 域名 `liuyidi.me` → 添加记录：

| 主机记录 | 记录类型 | 记录值 | TTL |
|----------|----------|--------|-----|
| `mlf` | A | `YOUR_ECS_IP` | 10 分钟 |
| `bot` | A | `YOUR_ECS_IP` | 10 分钟 |
| `kb` | A | `YOUR_ECS_IP` | 10 分钟 |

本机验证（等 1–5 分钟）：

```bash
dig +short mlf.liuyidi.me
dig +short bot.liuyidi.me
# 应返回 YOUR_ECS_IP
```

---

## 2. 安全组（再确认一次）

入方向只保留：

- TCP **22** → 你的办公网 IP（或临时 `0.0.0.0/0`，上线后收紧）
- TCP **80** → `0.0.0.0/0`
- TCP **443** → `0.0.0.0/0`

不要开 5432 / 8000 / 8080 / 8766 到公网。

---

## 3. SSH 登录 ECS

```bash
ssh -i /path/to/your-key.pem root@YOUR_ECS_IP
# Ubuntu 镜像也可能是：
# ssh -i /path/to/your-key.pem ubuntu@YOUR_ECS_IP
```

---

## 4. 安装基础软件

```bash
# 更新 + Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# 重新登录一次 SSH，使 docker 组生效

# Nginx + Certbot
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx git curl
sudo mkdir -p /var/www/certbot
```

验证：

```bash
docker --version
nginx -v
```

---

## 5. 准备代码目录

```bash
sudo mkdir -p /opt/demo && sudo chown "$USER:$USER" /opt/demo
cd /opt/demo

# 换成你真实的仓库地址（私有库用 HTTPS + PAT，或配置 SSH deploy key）
git clone https://github.com/<you>/mini-langfuse.git mini-langfuse
git clone https://github.com/<you>/minikb.git minikb
git clone https://github.com/<you>/nanobot.git nanobot
ln -sfn nanobot/minibot minibot

ls -la
# 应看到 mini-langfuse  minikb  minibot  nanobot
```

> 若还没 push `deploy/demo`，在本机先 `git push`，或用 `scp -r` 把整个 `mini-langfuse` 拷上去。

---

## 6. 开启 Swap（2C2G 必做）

```bash
sudo bash /opt/demo/mini-langfuse/deploy/demo/setup-swap.sh
free -h   # 应看到约 2G Swap
```

---

## 7. 配置环境变量并启动应用

```bash
cd /opt/demo/mini-langfuse/deploy/demo
cp .env.example .env
nano .env
```

`.env` 关键至少改成：

```env
POSTGRES_PASSWORD=<随机强密码>
OPENAI_API_KEY=<你的 DeepSeek 或 OpenAI key>
OPENAI_BASE_URL=https://api.deepseek.com/v1
MINIBOT_MODEL=deepseek-chat
MLF_CORS_ORIGINS=https://mlf.liuyidi.me,https://bot.liuyidi.me
```

路径若按 `/opt/demo` 布局，默认即可：

```env
MLF_DIR=../..
MINIKB_DIR=../../../minikb
MINIBOT_DIR=../../../minibot
```

启动（先 core，面试够用）：

```bash
./up.sh core
```

本机自检：

```bash
curl -s http://127.0.0.1:8000/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
curl -s http://127.0.0.1:8766/health
```

可选再起知识库：

```bash
./up.sh kb
curl -s http://127.0.0.1:8081/health
```

---

## 8. 配置 Nginx（先 HTTP，再证书）

**重要**：首次装 Nginx 时，`443 ssl` 段若还没有证书文件会启动失败。  
推荐流程：**先只监听 80 → Certbot 自动加 SSL**。

```bash
# 用仓库里的子域名配置（已含 80 + 443 占位）
# 若 nginx -t 因缺证书失败，用下面「仅 HTTP 临时配置」

sudo cp /opt/demo/mini-langfuse/deploy/demo/nginx-http-only.conf \
  /etc/nginx/sites-available/liuyidi-demo
sudo ln -sf /etc/nginx/sites-available/liuyidi-demo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

浏览器或本机：

```bash
curl -I http://mlf.liuyidi.me
# 应 200 或 301，且能通到 Langfuse
```

申请 HTTPS（Certbot 会改 Nginx 加上证书）：

```bash
sudo certbot --nginx \
  -d mlf.liuyidi.me \
  -d bot.liuyidi.me \
  -d kb.liuyidi.me \
  --email <你的邮箱> \
  --agree-tos \
  --redirect
```

验证：

```bash
curl -I https://mlf.liuyidi.me
curl -I https://bot.liuyidi.me
```

之后可把完整反代配置（含 SSE）合并回来；Certbot 已写好的 `ssl_certificate` 行不要删。  
更省事：在 certbot 成功后，用 `nginx-subdomains.conf` 覆盖，再把 certbot 生成的证书路径贴进各 `server` 的 ssl 指令，最后 `sudo nginx -t && sudo systemctl reload nginx`。

---

## 9. 验收清单

| 检查项 | 命令 / 操作 |
|--------|-------------|
| DNS | `dig +short mlf.liuyidi.me` = ECS IP |
| HTTPS | 浏览器打开 https://mlf.liuyidi.me |
| 注册 | Langfuse 注册第一个账号并登录 |
| 聊天 | https://bot.liuyidi.me/ui/ 发一句 |
| Trace | Langfuse → Traces 能看到新记录 |
| CORS | 浏览器 F12 无 CORS 红错 |

---

## 10. 常见问题

| 现象 | 处理 |
|------|------|
| `Connection timed out` | 安全组未开 80/443；或大陆机未备案 |
| Certbot `NXDOMAIN` | DNS 未生效，再等几分钟 |
| Certbot `Connection refused` | Nginx 未听 80：`sudo systemctl status nginx` |
| 502 Bad Gateway | `docker ps` 看容器是否 Up；`./up.sh core` 再起 |
| CORS | `.env` 的 `MLF_CORS_ORIGINS` 必须含 `https://mlf.liuyidi.me`，改完重建 server：`docker compose ... up -d --force-recreate server` |
| OOM / 容器反复重启 | 确认 swap；用 `core` 不要一次 `kb` |

---

## 演示地址（最终）

- **Langfuse**：https://mlf.liuyidi.me  
- **Minibot**：https://bot.liuyidi.me/ui/  
- **Minikb**：https://kb.liuyidi.me/ui/ （需 `./up.sh kb`）
