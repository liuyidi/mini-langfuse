"""ClickHouse HTTP sink."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


@dataclass(slots=True)
class ClickHouseSink:
    base_url: str
    database: str
    user: str = "default"
    password: str = ""
    timeout_seconds: float = 10.0

    def insert_json_each_row(self, table: str, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return

        query = f"INSERT INTO {table} FORMAT JSONEachRow"
        payload = "\n".join(json.dumps(row, default=str, ensure_ascii=False) for row in rows).encode("utf-8")
        params = urlencode({"database": self.database, "query": query})
        url = f"{self.base_url.rstrip('/')}/?{params}"
        request = Request(url, data=payload, method="POST")
        request.add_header("Content-Type", "application/json")
        if self.user:
            request.add_header("X-ClickHouse-User", self.user)
        if self.password:
            request.add_header("X-ClickHouse-Key", self.password)

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                response.read()
        except (HTTPError, URLError) as exc:  # pragma: no cover - network dependent
            raise RuntimeError(f"ClickHouse insert failed: {exc}") from exc

