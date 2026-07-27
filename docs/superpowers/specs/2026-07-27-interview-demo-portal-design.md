# Interview Demo Portal Design

**Date:** 2026-07-27  
**Status:** Approved (landing = A: `liuyidi.me`)

## Goals

Interview-facing surface for three products on one ECS:

| URL | Role |
|-----|------|
| `https://liuyidi.me` | Landing — who I am, projects, agent skills |
| `https://bot.liuyidi.me/` | Primary product — nanobot WebUI → minibot API |
| `https://bot.liuyidi.me/ui/` | DevUI — implementation notes for interviewer |
| `https://mlf.liuyidi.me` | Observability (mini-langfuse) |
| `https://kb.liuyidi.me` | Knowledge base (minikb) |

Cross-links: Landing ↔ products; WebUI/DevUI → mlf / kb / home.

## Phases

1. **P1 WebUI primary** — Serve `nanobot/web/dist` at `/` from minibot; keep `/ui` DevUI; Docker multi-stage build.
2. **P2 Nav links** — Sidebar + DevUI drawer → mlf, kb, landing.
3. **P3 Landing** — Static site under `mini-langfuse/deploy/demo/landing/` + nginx apex/`www`.
4. **P4 minikb** — Document/enable `./up.sh kb`; link live when healthy.
5. **P5 CI/CD** — GitHub Action SSH deploy on push to `main`.

## Non-goals

- Full WebUI↔minibot API parity (Automations etc.)
- Blue/green; multi-region

## Technical notes

- WebUI already defaults API/WS to minibot `:8766`.
- SPA mount via catch-all after API routers; `MINIBOT_WEBUI_DIST` override.
- Demo compose build context = nanobot monorepo root (for `webui/` + `minibot/`).
- CI secrets: `ECS_HOST`, `ECS_USER`, `ECS_SSH_KEY`.
