"""High level ClickHouse trace reader."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .client import ClickHouseHTTPClient
from .mappers import (
    aggregate_metrics_from_rows,
    build_tree_from_rows,
    normalize_observation_row,
    normalize_trace_row,
)
from .queries import TraceListFilters, build_trace_detail_sql, build_trace_list_sql


@dataclass(slots=True)
class ClickHouseReader:
    base_url: str
    database: str = "default"
    user: str = "default"
    password: str = ""
    timeout_seconds: float = 10.0

    def __post_init__(self) -> None:
        self._client = ClickHouseHTTPClient(
            base_url=self.base_url,
            database=self.database,
            user=self.user,
            password=self.password,
            timeout_seconds=self.timeout_seconds,
        )

    def list_traces(
        self,
        *,
        project_id: str,
        user_id: str | None = None,
        session_id: str | None = None,
        name: str | None = None,
        from_timestamp: datetime | None = None,
        to_timestamp: datetime | None = None,
        tags: str | None = None,
        tags_all: str | None = None,
        search: str | None = None,
        model: str | None = None,
        status: str | None = None,
        level: str | None = None,
        order_by: str = "timestamp",
        order_direction: str = "desc",
        limit: int = 50,
        page: int = 1,
    ) -> tuple[list[dict[str, Any]], int]:
        filters = TraceListFilters(
            project_id=project_id,
            user_id=user_id,
            session_id=session_id,
            name=name,
            from_timestamp=from_timestamp,
            to_timestamp=to_timestamp,
            tags=tags,
            tags_all=tags_all,
            search=search,
            model=model,
            status=status,
            level=level,
        )
        offset = max(0, (page - 1) * limit)
        list_sql, count_sql = build_trace_list_sql(
            filters=filters,
            order_by=order_by,
            order_direction=order_direction,
            limit=limit,
            offset=offset,
        )

        rows = self._client.query_json_each_row(list_sql)
        total_rows = self._client.query_json_each_row(count_sql)
        total = int(next(iter(total_rows[0].values()))) if total_rows else 0
        return [normalize_trace_row(row) for row in rows], total

    def get_trace(self, *, project_id: str, trace_id: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        trace_sql, obs_sql = build_trace_detail_sql(project_id, trace_id)
        trace_rows = self._client.query_json_each_row(trace_sql)
        if not trace_rows:
            return None, []
        obs_rows = [normalize_observation_row(row) for row in self._client.query_json_each_row(obs_sql)]
        return normalize_trace_row(trace_rows[0]), obs_rows

    def list_traces_with_rows(
        self,
        **kwargs: Any,
    ) -> tuple[list[dict[str, Any]], int]:
        return self.list_traces(**kwargs)

    def get_trace_with_rows(self, **kwargs: Any) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
        return self.get_trace(**kwargs)


__all__ = [
    "ClickHouseReader",
    "aggregate_metrics_from_rows",
    "build_tree_from_rows",
]
