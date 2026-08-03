"""Worker configuration."""
from __future__ import annotations

from dataclasses import dataclass
import os
import socket


def _env(name: str, default: str) -> str:
    value = os.getenv(name)
    return default if value is None or value == "" else value


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(slots=True)
class Settings:
    mode: str = _env("MLF_WORKER_MODE", "dry-run")
    redis_url: str = _env("MLF_REDIS_URL", "")
    redis_stream: str = _env("MLF_REDIS_STREAM", "mlf:ingestion")
    redis_group: str = _env("MLF_REDIS_GROUP", "mlf-worker")
    redis_consumer: str = _env("MLF_REDIS_CONSUMER", socket.gethostname())
    clickhouse_url: str = _env("MLF_CLICKHOUSE_URL", "http://localhost:8123")
    clickhouse_database: str = _env("MLF_CLICKHOUSE_DATABASE", "default")
    clickhouse_user: str = _env("MLF_CLICKHOUSE_USER", "default")
    clickhouse_password: str = _env("MLF_CLICKHOUSE_PASSWORD", "")
    batch_size: int = _env_int("MLF_WORKER_BATCH_SIZE", 100)
    poll_timeout_ms: int = _env_int("MLF_REDIS_POLL_TIMEOUT_MS", 5000)
    idle_sleep_seconds: float = float(_env("MLF_WORKER_IDLE_SLEEP_SECONDS", "2.0"))

