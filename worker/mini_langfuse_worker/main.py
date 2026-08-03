"""Console entrypoint for the worker."""
from __future__ import annotations

import argparse
import logging
import time

from .clickhouse import ClickHouseSink
from .config import Settings
from .queue import DryRunQueue, RedisStreamQueue
from .service import WorkerService


def _build_queue(settings: Settings):
    if settings.mode == "redis" and settings.redis_url:
        return RedisStreamQueue(
            settings.redis_url,
            settings.redis_stream,
            settings.redis_group,
            settings.redis_consumer,
        )
    return DryRunQueue()


def _build_sink(settings: Settings) -> ClickHouseSink:
    return ClickHouseSink(
        base_url=settings.clickhouse_url,
        database=settings.clickhouse_database,
        user=settings.clickhouse_user,
        password=settings.clickhouse_password,
    )


def main() -> None:
    parser = argparse.ArgumentParser(prog="mini-langfuse-worker")
    parser.add_argument("--once", action="store_true", help="Process one poll cycle and exit.")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = Settings()
    queue = _build_queue(settings)
    sink = _build_sink(settings)
    worker = WorkerService(sink)

    queue.ensure_ready()
    logging.info(
        "worker started mode=%s stream=%s group=%s consumer=%s",
        settings.mode,
        settings.redis_stream,
        settings.redis_group,
        settings.redis_consumer,
    )

    while True:
        jobs = queue.fetch(settings.batch_size, settings.poll_timeout_ms)
        if not jobs:
            if args.once:
                return
            time.sleep(settings.idle_sleep_seconds)
            continue

        for job in jobs:
            try:
                worker.process_job(job)
                queue.ack(job)
            except Exception as exc:  # noqa: BLE001
                logging.exception("job failed job_id=%s", job.job_id)
                queue.nack(job, f"{type(exc).__name__}: {exc}")

        if args.once:
            return

