#!/usr/bin/env bash
# Run database migrations
# Usage: ./scripts/migrate.sh [database_url]
#
# If no database_url is provided, uses MLF_DATABASE_URL env var or defaults to local SQLite

set -e

cd "$(dirname "$0")/.."

if [ -n "$1" ]; then
    export MLF_DATABASE_URL="$1"
fi

echo "Running migrations for: ${MLF_DATABASE_URL:-sqlite:///./mini_langfuse.db}"
alembic upgrade head
