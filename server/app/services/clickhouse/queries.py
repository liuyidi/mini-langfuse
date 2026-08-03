"""ClickHouse SQL builders for trace queries."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


def render_sql(*lines: str) -> str:
    """Join SQL lines without extra indentation surprises."""
    return "\n".join(line.rstrip() for line in lines)


def quote(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def _datetime_literal(value: datetime) -> str:
    return quote(value.isoformat())


def _csv_to_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(slots=True)
class TraceListFilters:
    project_id: str
    user_id: str | None = None
    session_id: str | None = None
    name: str | None = None
    from_timestamp: datetime | None = None
    to_timestamp: datetime | None = None
    tags: str | None = None
    tags_all: str | None = None
    search: str | None = None
    model: str | None = None
    status: str | None = None
    level: str | None = None

    def tag_or_list(self) -> list[str]:
        return _csv_to_list(self.tags)

    def tag_and_list(self) -> list[str]:
        return _csv_to_list(self.tags_all)


def build_trace_where_clause(filters: TraceListFilters) -> str:
    clauses = [f"project_id = {quote(filters.project_id)}"]
    if filters.user_id:
        clauses.append(f"user_id = {quote(filters.user_id)}")
    if filters.session_id:
        clauses.append(f"session_id = {quote(filters.session_id)}")
    if filters.name:
        clauses.append(
            f"positionCaseInsensitiveUTF8(ifNull(name, ''), {quote(filters.name)}) > 0"
        )
    if filters.from_timestamp:
        clauses.append(f"event_timestamp >= {_datetime_literal(filters.from_timestamp)}")
    if filters.to_timestamp:
        clauses.append(f"event_timestamp <= {_datetime_literal(filters.to_timestamp)}")

    tags = filters.tag_or_list()
    if tags:
        joined_tags = ", ".join(quote(tag) for tag in tags)
        clauses.append(f"hasAny(tags, [{joined_tags}])")

    tags_all = filters.tag_and_list()
    if tags_all:
        joined_tags = ", ".join(quote(tag) for tag in tags_all)
        clauses.append(f"hasAll(tags, [{joined_tags}])")

    if filters.search:
        q = quote(filters.search)
        clauses.append(
            "("
            + " OR ".join(
                [
                    f"positionCaseInsensitiveUTF8(ifNull(name, ''), {q}) > 0",
                    f"positionCaseInsensitiveUTF8(ifNull(input, ''), {q}) > 0",
                    f"positionCaseInsensitiveUTF8(ifNull(output, ''), {q}) > 0",
                ]
            )
            + ")"
        )

    if filters.model:
        clauses.append(
            "id IN ("
            "SELECT DISTINCT trace_id FROM observations "
            f"WHERE project_id = {quote(filters.project_id)} AND "
            f"positionCaseInsensitiveUTF8(ifNull(model, ''), {quote(filters.model)}) > 0"
            ")"
        )
    if filters.status:
        clauses.append(
            "id IN ("
            "SELECT DISTINCT trace_id FROM observations "
            f"WHERE project_id = {quote(filters.project_id)} AND status = {quote(filters.status)}"
            ")"
        )
    if filters.level:
        clauses.append(
            "id IN ("
            "SELECT DISTINCT trace_id FROM observations "
            f"WHERE project_id = {quote(filters.project_id)} AND level = {quote(filters.level)}"
            ")"
        )

    return " AND ".join(clauses)


def build_trace_list_sql(
    *,
    filters: TraceListFilters,
    order_by: str,
    order_direction: str,
    limit: int,
    offset: int,
) -> tuple[str, str]:
    trace_where = build_trace_where_clause(filters)
    trace_cte = build_trace_aggregate_cte(trace_where)
    obs_cte = build_observation_aggregate_cte(filters.project_id)
    order_clause = build_order_clause(order_by, order_direction)

    list_sql = render_sql(
        "WITH",
        f"{trace_cte},",
        obs_cte,
        "SELECT",
        "  t.id,",
        "  t.project_id,",
        "  t.name,",
        "  t.user_id,",
        "  t.session_id,",
        "  t.input,",
        "  t.output,",
        "  t.metadata,",
        "  t.tags,",
        "  t.release,",
        "  t.version,",
        "  t.timestamp,",
        "  t.created_at,",
        "  o.duration_ms,",
        "  o.total_tokens,",
        "  o.total_cost_usd,",
        "  o.observation_count",
        "FROM trace_rows AS t",
        "LEFT JOIN obs_rows AS o USING (id)",
        f"ORDER BY {order_clause}",
        f"LIMIT {limit}",
        f"OFFSET {offset}",
        "FORMAT JSONEachRow",
    )

    count_sql = render_sql(
        "WITH",
        trace_cte,
        "SELECT count() AS total_count",
        "FROM trace_rows",
        "FORMAT JSONEachRow",
    )

    return list_sql, count_sql


def build_trace_detail_sql(project_id: str, trace_id: str) -> tuple[str, str]:
    trace_sql = render_sql(
        "SELECT",
        "  trace_id AS id,",
        "  any(project_id) AS project_id,",
        "  argMax(name, ingested_at) AS name,",
        "  argMax(user_id, ingested_at) AS user_id,",
        "  argMax(session_id, ingested_at) AS session_id,",
        "  argMax(input, ingested_at) AS input,",
        "  argMax(output, ingested_at) AS output,",
        "  argMax(metadata, ingested_at) AS metadata,",
        "  argMax(tags, ingested_at) AS tags,",
        "  argMax(release, ingested_at) AS release,",
        "  argMax(version, ingested_at) AS version,",
        "  max(event_timestamp) AS timestamp,",
        "  min(ingested_at) AS created_at",
        "FROM traces",
        f"WHERE project_id = {quote(project_id)} AND trace_id = {quote(trace_id)}",
        "GROUP BY trace_id",
        "LIMIT 1",
        "FORMAT JSONEachRow",
    )

    obs_sql = render_sql(
        "SELECT",
        "  observation_id AS id,",
        "  trace_id,",
        "  parent_observation_id,",
        "  type,",
        "  name,",
        "  start_time,",
        "  end_time,",
        "  status,",
        "  status_message,",
        "  level,",
        "  input,",
        "  output,",
        "  metadata,",
        "  model,",
        "  model_parameters,",
        "  prompt_tokens,",
        "  completion_tokens,",
        "  total_tokens,",
        "  input_cost_usd,",
        "  output_cost_usd,",
        "  total_cost_usd,",
        "  prompt_version_id",
        "FROM (",
        "  SELECT",
        "    observation_id,",
        "    trace_id,",
        "    argMax(project_id, ingested_at) AS project_id,",
        "    argMax(parent_observation_id, ingested_at) AS parent_observation_id,",
        "    argMax(type, ingested_at) AS type,",
        "    argMax(name, ingested_at) AS name,",
        "    argMax(start_time, ingested_at) AS start_time,",
        "    argMax(end_time, ingested_at) AS end_time,",
        "    argMax(status, ingested_at) AS status,",
        "    argMax(status_message, ingested_at) AS status_message,",
        "    argMax(level, ingested_at) AS level,",
        "    argMax(input, ingested_at) AS input,",
        "    argMax(output, ingested_at) AS output,",
        "    argMax(metadata, ingested_at) AS metadata,",
        "    argMax(model, ingested_at) AS model,",
        "    argMax(model_parameters, ingested_at) AS model_parameters,",
        "    argMax(prompt_tokens, ingested_at) AS prompt_tokens,",
        "    argMax(completion_tokens, ingested_at) AS completion_tokens,",
        "    argMax(total_tokens, ingested_at) AS total_tokens,",
        "    argMax(input_cost_usd, ingested_at) AS input_cost_usd,",
        "    argMax(output_cost_usd, ingested_at) AS output_cost_usd,",
        "    argMax(total_cost_usd, ingested_at) AS total_cost_usd,",
        "    argMax(prompt_version_id, ingested_at) AS prompt_version_id",
        "  FROM observations",
        f"  WHERE project_id = {quote(project_id)} AND trace_id = {quote(trace_id)}",
        "  GROUP BY observation_id, trace_id",
        ")",
        "FORMAT JSONEachRow",
    )
    return trace_sql, obs_sql


def build_order_clause(order_by: str, order_direction: str) -> str:
    direction = "DESC" if order_direction.lower() != "asc" else "ASC"
    key = order_by.lower()
    if key == "cost":
        return f"ifNull(o.total_cost_usd, 0) {direction}, t.timestamp DESC"
    if key == "latency":
        return f"ifNull(o.duration_ms, 0) {direction}, t.timestamp DESC"
    if key == "tokens":
        return f"ifNull(o.total_tokens, 0) {direction}, t.timestamp DESC"
    return f"t.timestamp {direction}"


def build_trace_aggregate_cte(trace_where: str) -> str:
    return render_sql(
        "trace_rows AS (",
        "  SELECT",
        "    trace_id AS id,",
        "    any(project_id) AS project_id,",
        "    argMax(name, ingested_at) AS name,",
        "    argMax(user_id, ingested_at) AS user_id,",
        "    argMax(session_id, ingested_at) AS session_id,",
        "    argMax(input, ingested_at) AS input,",
        "    argMax(output, ingested_at) AS output,",
        "    argMax(metadata, ingested_at) AS metadata,",
        "    argMax(tags, ingested_at) AS tags,",
        "    argMax(release, ingested_at) AS release,",
        "    argMax(version, ingested_at) AS version,",
        "    max(event_timestamp) AS timestamp,",
        "    min(ingested_at) AS created_at",
        "  FROM traces",
        f"  WHERE {trace_where}",
        "  GROUP BY trace_id",
        ")",
    )


def build_observation_aggregate_cte(project_id: str) -> str:
    return render_sql(
        "obs_rows AS (",
        "  SELECT",
        "    trace_id AS id,",
        "    if(",
        "      isNull(min_start_time) OR isNull(max_end_time),",
        "      NULL,",
        "      dateDiff('millisecond', min_start_time, max_end_time)",
        "    ) AS duration_ms,",
        "    total_tokens,",
        "    total_cost_usd,",
        "    observation_count",
        "  FROM (",
        "    SELECT",
        "      trace_id,",
        "      count() AS observation_count,",
        "      sum(total_tokens) AS total_tokens,",
        "      sum(total_cost_usd) AS total_cost_usd,",
        "      min(start_time) AS min_start_time,",
        "      max(end_time) AS max_end_time",
        "    FROM observations",
        f"    WHERE project_id = {quote(project_id)}",
        "    GROUP BY trace_id",
        "  )",
        ")",
    )

