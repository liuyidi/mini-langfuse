#!/usr/bin/env bash
# Start the production stack from deploy/. Run from repo root or deploy/.
# Do not use the repo-root docker-compose.yml on this host.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY="${ROOT}/deploy"
COMPOSE_FILE="${DEPLOY}/docker-compose.yml"

if [[ -f "${DEPLOY}/.env" ]]; then
  ENV_FILE="${DEPLOY}/.env"
  MLF_ENV_FILE=".env"
elif [[ -f "${DEPLOY}/.env.prod" ]]; then
  ENV_FILE="${DEPLOY}/.env.prod"
  MLF_ENV_FILE=".env.prod"
  echo "note: using legacy ${ENV_FILE}; rename to deploy/.env when convenient" >&2
else
  echo "Missing ${DEPLOY}/.env — copy from deploy/.env.example first." >&2
  exit 1
fi

export MLF_ENV_FILE
cd "$ROOT"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build "$@"
