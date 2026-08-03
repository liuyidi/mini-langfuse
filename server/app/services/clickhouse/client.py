"""Low-level ClickHouse HTTP client."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx


def parse_json_each_row(text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in text.splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


@dataclass(slots=True)
class ClickHouseHTTPClient:
    base_url: str
    database: str = "default"
    user: str = "default"
    password: str = ""
    timeout_seconds: float = 10.0

    def query_json_each_row(self, sql: str) -> list[dict[str, Any]]:
        params = {"database": self.database}
        headers = {"Content-Type": "text/plain; charset=utf-8"}
        if self.user:
            headers["X-ClickHouse-User"] = self.user
        if self.password:
            headers["X-ClickHouse-Key"] = self.password

        resp = httpx.post(
            self.base_url.rstrip("/"),
            params=params,
            content=sql.encode("utf-8"),
            headers=headers,
            timeout=self.timeout_seconds,
        )
        resp.raise_for_status()
        return parse_json_each_row(resp.text)

