"""End-to-end ingestion tests via TestClient (also covers auth + trace read)."""
from __future__ import annotations

from datetime import datetime, timezone


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _batch(events):
    return {"batch": events}


def test_auth_required(client):
    r = client.post("/api/public/ingestion", json=_batch([]))
    assert r.status_code == 401


def test_auth_wrong_secret(client):
    r = client.post(
        "/api/public/ingestion",
        json=_batch([]),
        auth=("pk-lf-demo", "sk-wrong"),
    )
    assert r.status_code == 401


def test_health(client):
    assert client.get("/health").status_code == 200


def test_trace_and_span_roundtrip(client, auth):
    trace_id = "trace_test1"
    obs_id = "obs_test1"
    now = _iso(datetime.now(timezone.utc))

    events = [
        {
            "id": "evt-t",
            "type": "trace-create",
            "timestamp": now,
            "body": {"id": trace_id, "name": "unit-test", "userId": "u1", "timestamp": now},
        },
        {
            "id": "evt-s",
            "type": "span-create",
            "timestamp": now,
            "body": {
                "id": obs_id,
                "traceId": trace_id,
                "name": "step-1",
                "startTime": now,
                "endTime": now,
                "input": {"q": "hi"},
                "output": {"a": "yes"},
            },
        },
    ]
    r = client.post("/api/public/ingestion", json=_batch(events), auth=auth)
    assert r.status_code == 200
    body = r.json()
    assert len(body["successes"]) == 2
    assert body["errors"] == []

    detail = client.get(f"/api/public/traces/{trace_id}", auth=auth).json()
    assert detail["id"] == trace_id
    assert len(detail["observations"]) == 1
    assert detail["observations"][0]["id"] == obs_id
    assert detail["observations"][0]["output"] == {"a": "yes"}


def test_ingestion_is_idempotent(client, auth):
    """Re-sending the same trace-create with the same id should not duplicate."""
    trace_id = "trace_idem"
    now = _iso(datetime.now(timezone.utc))
    evt = {
        "id": "evt-1",
        "type": "trace-create",
        "timestamp": now,
        "body": {"id": trace_id, "name": "v1", "timestamp": now},
    }
    r1 = client.post("/api/public/ingestion", json=_batch([evt]), auth=auth)
    assert r1.status_code == 200

    # Second send with updated name - upserts
    evt2 = dict(evt, id="evt-2")
    evt2["body"] = dict(evt["body"], name="v2")
    r2 = client.post("/api/public/ingestion", json=_batch([evt2]), auth=auth)
    assert r2.status_code == 200

    detail = client.get(f"/api/public/traces/{trace_id}", auth=auth).json()
    assert detail["name"] == "v2"


def test_generation_computes_cost_and_tokens(client, auth):
    trace_id = "trace_gen"
    now = _iso(datetime.now(timezone.utc))
    events = [
        {
            "id": "e1",
            "type": "trace-create",
            "timestamp": now,
            "body": {"id": trace_id, "timestamp": now},
        },
        {
            "id": "e2",
            "type": "generation-create",
            "timestamp": now,
            "body": {
                "id": "obs_gen",
                "traceId": trace_id,
                "name": "llm",
                "startTime": now,
                "endTime": now,
                "model": "gpt-4o-mini",
                "usage": {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000},
            },
        },
    ]
    client.post("/api/public/ingestion", json=_batch(events), auth=auth)
    detail = client.get(f"/api/public/traces/{trace_id}", auth=auth).json()
    obs = detail["observations"][0]
    assert obs["total_tokens"] == 2_000_000
    # 1M input @ $0.15/M + 1M output @ $0.60/M = $0.75
    assert abs(obs["total_cost_usd"] - 0.75) < 1e-6


def test_bad_event_does_not_abort_batch(client, auth):
    """A malformed event is reported as an error, but siblings still succeed."""
    now = _iso(datetime.now(timezone.utc))
    events = [
        {
            "id": "ok",
            "type": "trace-create",
            "timestamp": now,
            "body": {"id": "trace_ok", "timestamp": now, "name": "ok"},
        },
        {
            "id": "bad",
            "type": "span-create",
            "timestamp": now,
            "body": {"id": "no-trace-id-provided"},  # missing traceId → validation error
        },
    ]
    r = client.post("/api/public/ingestion", json=_batch(events), auth=auth)
    assert r.status_code == 200
    body = r.json()
    assert {s["id"] for s in body["successes"]} == {"ok"}
    assert {e["id"] for e in body["errors"]} == {"bad"}

    # The good one persisted
    r2 = client.get("/api/public/traces/trace_ok", auth=auth)
    assert r2.status_code == 200
