CREATE DATABASE IF NOT EXISTS default;

CREATE TABLE IF NOT EXISTS default.traces
(
    event_id String,
    project_id String,
    trace_id String,
    name Nullable(String),
    user_id Nullable(String),
    session_id Nullable(String),
    input Nullable(String),
    output Nullable(String),
    metadata Nullable(String),
    tags Array(String) DEFAULT [],
    release Nullable(String),
    version Nullable(String),
    event_timestamp DateTime64(3, 'UTC'),
    ingested_at DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_timestamp)
ORDER BY (project_id, trace_id, event_timestamp, event_id);

CREATE TABLE IF NOT EXISTS default.observations
(
    event_id String,
    project_id String,
    observation_id String,
    trace_id String,
    parent_observation_id Nullable(String),
    type LowCardinality(String),
    name Nullable(String),
    start_time DateTime64(3, 'UTC'),
    end_time Nullable(DateTime64(3, 'UTC')),
    status LowCardinality(String),
    status_message Nullable(String),
    level LowCardinality(String),
    input Nullable(String),
    output Nullable(String),
    metadata Nullable(String),
    model Nullable(String),
    model_parameters Nullable(String),
    prompt_tokens Nullable(UInt64),
    completion_tokens Nullable(UInt64),
    total_tokens Nullable(UInt64),
    input_cost_usd Nullable(Float64),
    output_cost_usd Nullable(Float64),
    total_cost_usd Nullable(Float64),
    prompt_version_id Nullable(String),
    event_timestamp DateTime64(3, 'UTC'),
    ingested_at DateTime64(3, 'UTC')
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (project_id, trace_id, start_time, event_id);
