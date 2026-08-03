"""Tests for queue-first ingestion wiring."""
from __future__ import annotations

from datetime import datetime, timezone


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def test_ingestion_enqueues_when_queue_is_enabled(client, auth, monkeypatch):
    from app.api import ingestion as ingestion_api
    from app.config import settings

    captured = {}

    def fake_enqueue(*, redis_url, stream_name, project_id, events, maxlen):
        captured.update(
            {
                "redis_url": redis_url,
                "stream_name": stream_name,
                "project_id": project_id,
                "events": events,
                "maxlen": maxlen,
            }
        )
        return {"job_id": "job_test"}

    monkeypatch.setattr(settings, "ingestion_queue_url", "redis://example:6379/0")
    monkeypatch.setattr(settings, "ingestion_queue_stream", "mlf:ingestion-test")
    monkeypatch.setattr(settings, "ingestion_queue_maxlen", 123)
    monkeypatch.setattr(ingestion_api, "enqueue_ingestion_job", fake_enqueue)

    now = _iso(datetime.now(timezone.utc))
    r = client.post(
        "/api/public/ingestion",
        json={
            "batch": [
                {
                    "id": "evt-queue",
                    "type": "trace-create",
                    "timestamp": now,
                    "body": {"id": "trace_queue", "timestamp": now},
                }
            ]
        },
        auth=auth,
    )

    assert r.status_code == 202
    assert r.headers["X-Ingestion-Job-Id"] == "job_test"
    assert r.headers["X-Ingestion-Queued"] == "true"
    assert captured["redis_url"] == "redis://example:6379/0"
    assert captured["stream_name"] == "mlf:ingestion-test"
    assert captured["project_id"] == "proj_demo"
    assert captured["maxlen"] == 123
    assert len(captured["events"]) == 1
