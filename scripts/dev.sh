#!/usr/bin/env bash
# Restart mini-langfuse locally (kill old :8000/:5173 then start fresh).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

for port in 8000 5173 8001 5174; do
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    echo "killing :$port -> $pids"
    kill -9 $pids || true
  fi
done
sleep 1

cd "$ROOT/server"
if [[ ! -x .venv/bin/uvicorn ]]; then
  python3 -m venv .venv
  .venv/bin/pip install -e '.[dev]'
fi

cd "$ROOT/web"
if [[ ! -d node_modules/recharts ]]; then
  npm install --registry https://registry.npmjs.org/
fi

cd "$ROOT/server"
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
API_PID=$!
cd "$ROOT/web"
npm run dev -- --host 0.0.0.0 --port 5173 &
WEB_PID=$!

echo "API pid=$API_PID  http://localhost:8000"
echo "UI  pid=$WEB_PID  http://localhost:5173"
echo "Ctrl+C will not stop background jobs; use: kill $API_PID $WEB_PID"
wait
