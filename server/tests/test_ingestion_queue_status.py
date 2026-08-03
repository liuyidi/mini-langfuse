"""Tests for queue status endpoint."""
from __future__ import annotations


def test_ingestion_queue_status_disabled(client, auth):
    r = client.get("/api/public/ingestion/queue-status", auth=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False


def test_ingestion_queue_status_enabled(client, auth, monkeypatch):
    from app.api import ingestion as ingestion_api
    from app.config import settings

    monkeypatch.setattr(settings, "ingestion_queue_url", "redis://example:6379/0")
    monkeypatch.setattr(settings, "ingestion_queue_stream", "mlf:ingestion-test")
    monkeypatch.setattr(settings, "ingestion_queue_group", "mlf-worker-test")
    monkeypatch.setattr(
        ingestion_api,
        "get_queue_status",
        lambda **kwargs: {
            "enabled": True,
            "stream": kwargs["stream_name"],
            "group": kwargs["group_name"],
            "stream_length": 12,
            "pending": 2,
            "pending_info": None,
        },
    )

    r = client.get("/api/public/ingestion/queue-status", auth=auth)
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    assert body["stream"] == "mlf:ingestion-test"
    assert body["group"] == "mlf-worker-test"
    assert body["stream_length"] == 12
    assert body["pending"] == 2
