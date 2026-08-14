#!/usr/bin/env bash
# Start demo stack (mini-langfuse + minibot). Run from deploy/demo/ or any cwd.
# minikb is deployed separately on Volcengine (publish-volcengine-minikb.yml).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${DIR}/.env"
COMPOSE=(docker compose -f "${DIR}/docker-compose.yml" --env-file "${ENV_FILE}")

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "  cp ${DIR}/.env.example ${DIR}/.env"
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

MLF_DIR="${MLF_DIR:-${DIR}/../..}"
MINIBOT_REPO_DIR="${MINIBOT_REPO_DIR:-}"
MINIBOT_DIR="${MINIBOT_DIR:-}"

# Resolve relative paths against deploy/demo
resolve() {
  local p="$1"
  if [[ "$p" = /* ]]; then echo "$p"; else echo "$(cd "${DIR}" && cd "$p" && pwd)"; fi
}

export MLF_DIR="$(resolve "$MLF_DIR")"

# MINIBOT_REPO_DIR = monorepo root (contains Dockerfile.minibot + webui/ + minibot/)
if [[ -z "$MINIBOT_REPO_DIR" ]]; then
  if [[ -n "$MINIBOT_DIR" ]]; then
    MINIBOT_DIR="$(resolve "$MINIBOT_DIR")"
    if [[ -f "${MINIBOT_DIR}/Dockerfile.minibot" ]]; then
      MINIBOT_REPO_DIR="$MINIBOT_DIR"
    elif [[ -f "${MINIBOT_DIR}/../Dockerfile.minibot" ]]; then
      MINIBOT_REPO_DIR="$(cd "${MINIBOT_DIR}/.." && pwd)"
    fi
  fi
  if [[ -z "$MINIBOT_REPO_DIR" ]]; then
    MINIBOT_REPO_DIR="$(resolve "../../../minibot")"
  fi
else
  MINIBOT_REPO_DIR="$(resolve "$MINIBOT_REPO_DIR")"
fi
export MINIBOT_REPO_DIR

if [[ -z "${MINIBOT_DIR:-}" ]]; then
  if [[ -d "${MINIBOT_REPO_DIR}/minibot" ]]; then
    MINIBOT_DIR="${MINIBOT_REPO_DIR}/minibot"
  else
    MINIBOT_DIR="$MINIBOT_REPO_DIR"
  fi
else
  MINIBOT_DIR="$(resolve "$MINIBOT_DIR")"
fi
export MINIBOT_DIR

echo "MLF_DIR=$MLF_DIR"
echo "MINIBOT_REPO_DIR=$MINIBOT_REPO_DIR"
echo "MINIBOT_DIR=$MINIBOT_DIR"

for d in "$MLF_DIR" "$MINIBOT_REPO_DIR"; do
  if [[ ! -d "$d" ]]; then
    echo "ERROR: path not found: $d" >&2
    exit 1
  fi
done

if [[ ! -f "${MINIBOT_REPO_DIR}/Dockerfile.minibot" ]]; then
  echo "ERROR: missing ${MINIBOT_REPO_DIR}/Dockerfile.minibot" >&2
  exit 1
fi

MODE="${1:-core}"
shift || true

case "$MODE" in
  core|"")
    echo "Starting core: postgres + mini-langfuse + minibot(+webui)"
    ;;
  kb|full)
    echo "ERROR: minikb is no longer part of this compose stack." >&2
    echo "  Deploy via minikb/.github/workflows/publish-volcengine-minikb.yml" >&2
    echo "  Public URL: https://kb.liuyidi.me (Aliyun nginx → Volcengine :8080)" >&2
    exit 1
    ;;
  *)
    echo "Usage: $0 [core] [extra docker compose args...]"
    echo "  core  — langfuse + minibot (default)"
    echo "  (kb/full removed — use Volcengine minikb publish workflow)"
    exit 1
    ;;
esac

"${COMPOSE[@]}" up -d --build "$@"

echo
echo "Health:"
curl -fsS http://127.0.0.1:8000/health && echo "  mlf-server ok" || echo "  mlf-server FAIL"
curl -fsS -o /dev/null -w "  mlf-web %{http_code}\n" http://127.0.0.1:8080/ || true
curl -fsS http://127.0.0.1:8766/health && echo "  minibot ok" || echo "  minibot FAIL"
curl -fsS -o /dev/null -w "  webui / %{http_code}\n" http://127.0.0.1:8766/ || true
curl -fsS -o /dev/null -w "  devui /ui/ %{http_code}\n" http://127.0.0.1:8766/ui/ || true
curl -fsS https://kb.liuyidi.me/health >/dev/null \
  && echo "  minikb (public) ok" \
  || echo "  minikb (public) FAIL — check Aliyun nginx → Volcengine"

echo
echo "Open:"
echo "  Landing   https://liuyidi.me/   (after P3 nginx)"
echo "  WebUI     http://127.0.0.1:8766/"
echo "  DevUI     http://127.0.0.1:8766/ui/"
echo "  Langfuse  http://127.0.0.1:8080/"
echo "  Minikb    https://kb.liuyidi.me/ui/  (Volcengine)"
