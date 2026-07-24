"""Tests for /api/public/prompts, versioning, and label movement."""
from __future__ import annotations


def _create(client, auth, **body):
    return client.post("/api/public/prompts", json=body, auth=auth)


def test_prompt_version_auto_increments(client, auth):
    r1 = _create(client, auth, name="p1", content="Hello v1")
    assert r1.status_code == 200
    assert r1.json()["version"] == 1

    r2 = _create(client, auth, name="p1", content="Hello v2")
    assert r2.json()["version"] == 2

    detail = client.get("/api/public/prompts/p1", auth=auth).json()
    assert detail["latest_version"] == 2
    assert [v["version"] for v in detail["versions"]] == [2, 1]


def test_production_label_moves_between_versions(client, auth):
    _create(client, auth, name="p2", content="v1")
    _create(client, auth, name="p2", content="v2", labels=["production"])

    # v2 has production, v1 doesn't
    detail = client.get("/api/public/prompts/p2", auth=auth).json()
    v_by_num = {v["version"]: v for v in detail["versions"]}
    assert "production" in (v_by_num[2]["labels"] or [])
    assert "production" not in (v_by_num[1]["labels"] or [])

    # Now promote v1 back to production via PATCH
    v1_id = v_by_num[1]["id"]
    r = client.patch(
        f"/api/public/prompt-versions/{v1_id}/labels",
        json={"labels": ["production"]},
        auth=auth,
    )
    assert r.status_code == 200

    detail = client.get("/api/public/prompts/p2", auth=auth).json()
    v_by_num = {v["version"]: v for v in detail["versions"]}
    assert "production" in (v_by_num[1]["labels"] or [])
    assert "production" not in (v_by_num[2]["labels"] or [])


def test_resolve_by_label_and_version(client, auth):
    _create(client, auth, name="p3", content="v1", labels=["production"])
    _create(client, auth, name="p3", content="v2")

    r = client.get("/api/public/prompts/p3/resolve?label=production", auth=auth)
    assert r.status_code == 200
    assert r.json()["version"] == 1  # label stayed on v1 since v2 was created without it

    r = client.get("/api/public/prompts/p3/resolve?version=2", auth=auth)
    assert r.json()["version"] == 2

    # No filters → latest
    r = client.get("/api/public/prompts/p3/resolve", auth=auth)
    assert r.json()["version"] == 2


def test_score_validation(client, auth):
    # need a trace to attach a score to
    trace_id = "trace_score"
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    client.post(
        "/api/public/ingestion",
        json={
            "batch": [
                {
                    "id": "e",
                    "type": "trace-create",
                    "timestamp": now,
                    "body": {"id": trace_id, "timestamp": now, "name": "for-score"},
                }
            ]
        },
        auth=auth,
    )

    # Missing value on NUMERIC → 422
    r = client.post(
        "/api/public/scores",
        json={"traceId": trace_id, "name": "helpfulness"},
        auth=auth,
    )
    assert r.status_code == 422

    # Valid numeric
    r = client.post(
        "/api/public/scores",
        json={"traceId": trace_id, "name": "helpfulness", "value": 0.9, "source": "EVAL"},
        auth=auth,
    )
    assert r.status_code == 200

    # Valid categorical
    r = client.post(
        "/api/public/scores",
        json={
            "traceId": trace_id,
            "name": "tone",
            "dataType": "CATEGORICAL",
            "stringValue": "friendly",
        },
        auth=auth,
    )
    assert r.status_code == 200

    # List includes both
    r = client.get(f"/api/public/scores?traceId={trace_id}", auth=auth).json()
    assert r["total"] == 2
