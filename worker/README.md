# Mini Langfuse Worker

This directory contains the first Python worker prototype for the data-plane migration:

- consume queued ingestion jobs
- normalize trace / observation payloads
- write batches to ClickHouse

## Run

The worker can start in a dry-run mode with no external services:

```bash
cd worker
python -m mini_langfuse_worker
```

## Environment

- `MLF_WORKER_MODE`: `dry-run` or `redis`
- `MLF_REDIS_URL`: Redis connection string for `redis` mode
- `MLF_REDIS_STREAM`: Redis Stream name, default `mlf:ingestion`
- `MLF_REDIS_GROUP`: Redis consumer group, default `mlf-worker`
- `MLF_REDIS_CONSUMER`: Consumer name, default to hostname
- `MLF_CLICKHOUSE_URL`: ClickHouse HTTP endpoint, default `http://localhost:8123`
- `MLF_CLICKHOUSE_DATABASE`: ClickHouse database name, default `default`
- `MLF_CLICKHOUSE_USER`: ClickHouse user, default `default`
- `MLF_CLICKHOUSE_PASSWORD`: ClickHouse password, default empty
- `MLF_WORKER_BATCH_SIZE`: Batch size for inserts, default `100`

## Notes

The initial implementation is intentionally small:

- it uses Redis Streams when configured
- it falls back to a no-op loop in dry-run mode
- it writes ClickHouse rows through the HTTP interface, so there is no hard dependency on a native driver yet
