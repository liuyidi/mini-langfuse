#!/bin/bash
# Runs once on first Postgres volume init (docker-entrypoint-initdb.d).
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE minikb;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname minikb <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

echo "demo postgres: databases minilangfuse + minikb (pgvector) ready"
