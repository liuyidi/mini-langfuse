#!/usr/bin/env bash
# Start demo stack. Run from deploy/demo/ or any cwd.
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
MINIKB_DIR="${MINIKB_DIR:-${DIR}/../../../minikb}"
MINIBOT_DIR="${MINIBOT_DIR:-${DIR}/../../../minibot}"
NANOBOT_DIR="${NANOBOT_DIR:-}"

# Resolve relative paths against deploy/demo
resolve() {
  local p="$1"
  if [[ "$p" = /* ]]; then echo "$p"; else echo "$(cd "${DIR}" && cd "$p" && pwd)"; fi
}

export MLF_DIR="$(resolve "$MLF_DIR")"
export MINIKB_DIR="$(resolve "$MINIKB_DIR")"
export MINIBOT_DIR="$(resolve "$MINIBOT_DIR")"

# NANOBOT_DIR = monorepo root (parent of minibot package when using /opt/demo/nanobot)
if [[ -z "$NANOBOT_DIR" ]]; then
  if [[ -d "${MINIBOT_DIR}/../webui" ]]; then
    NANOBOT_DIR="$(cd "${MINIBOT_DIR}/.." && pwd)"
  elif [[ -d "${MINIBOT_DIR}/webui" ]]; then
    NANOBOT_DIR="$MINIBOT_DIR"
  else
    NANOBOT_DIR="$(resolve "../../../nanobot")"
  fi
else
  NANOBOT_DIR="$(resolve "$NANOBOT_DIR")"
fi
export NANOBOT_DIR

echo "MLF_DIR=$MLF_DIR"
echo "MINIKB_DIR=$MINIKB_DIR"
echo "MINIBOT_DIR=$MINIBOT_DIR"
echo "NANOBOT_DIR=$NANOBOT_DIR"

for d in "$MLF_DIR" "$NANOBOT_DIR"; do
  if [[ ! -d "$d" ]]; then
    echo "ERROR: path not found: $d" >&2
    exit 1
  fi
done

if [[ ! -f "${NANOBOT_DIR}/Dockerfile.minibot" ]]; then
  echo "ERROR: missing ${NANOBOT_DIR}/Dockerfile.minibot" >&2
  exit 1
fi

PROFILE_ARGS=()
MODE="${1:-core}"
shift || true

case "$MODE" in
  core)
    echo "Starting core: postgres + mini-langfuse + minibot(+webui)"
    ;;
  kb|full)
    if [[ ! -d "$MINIKB_DIR" ]]; then
      echo "ERROR: minikb path not found: $MINIKB_DIR" >&2
      exit 1
    fi
    PROFILE_ARGS=(--profile "$MODE")
    echo "Starting full demo (includes minikb + minio)"
    ;;
  *)
    echo "Usage: $0 [core|kb|full] [extra docker compose args...]"
    echo "  core  — langfuse + minibot (default, lightest)"
    echo "  kb    — also minikb + minio"
    echo "  full  — alias of kb"
    exit 1
    ;;
esac

"${COMPOSE[@]}" "${PROFILE_ARGS[@]}" up -d --build "$@"

echo
echo "Health:"
curl -fsS http://127.0.0.1:8000/health && echo "  mlf-server ok" || echo "  mlf-server FAIL"
curl -fsS -o /dev/null -w "  mlf-web %{http_code}\n" http://127.0.0.1:8080/ || true
curl -fsS http://127.0.0.1:8766/health && echo "  minibot ok" || echo "  minibot FAIL"
curl -fsS -o /dev/null -w "  webui / %{http_code}\n" http://127.0.0.1:8766/ || true
curl -fsS -o /dev/null -w "  devui /ui/ %{http_code}\n" http://127.0.0.1:8766/ui/ || true
if [[ "$MODE" != "core" ]]; then
  curl -fsS http://127.0.0.1:8081/health && echo "  minikb ok" || echo "  minikb FAIL"
fi

echo
echo "Open:"
echo "  Landing   https://liuyidi.me/   (after P3 nginx)"
echo "  WebUI     http://127.0.0.1:8766/"
echo "  DevUI     http://127.0.0.1:8766/ui/"
echo "  Langfuse  http://127.0.0.1:8080/"
[[ "$MODE" != "core" ]] && echo "  Minikb    http://127.0.0.1:8081/ui/"
