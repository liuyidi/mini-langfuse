#!/usr/bin/env bash
# Start production stack. Run from repo root.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/deploy/.env.prod"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from deploy/.env.prod.example first." >&2
  exit 1
fi

cd "$ROOT"
docker compose -f deploy/docker-compose.prod.yml --env-file "$ENV_FILE" up -d --build "$@"
