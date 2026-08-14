#!/bin/bash
# Runs once on first Postgres volume init (docker-entrypoint-initdb.d).
# Only creates the mini-langfuse database; POSTGRES_DB already set minilangfuse.
# minikb DB lives on Volcengine, not this demo Postgres.
set -euo pipefail

echo "demo postgres: database minilangfuse ready (minikb is external)"
