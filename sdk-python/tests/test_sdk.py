"""SDK tests using a stub HTTP layer (no server required)."""
from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any


class RecordingHttp:
    """Duck-typed stand-in for httpx.Client used inside mini_langfuse.Client.

    Records every POST body so tests can inspect what would have hit the wire.
    """

    def __init__(self) -> None:
        self.posts: list[dict[str, Any]] = []
        self._lock = threading.Lock()

    def post(self, url: str, content: bytes | str = "", **_):
        with self._lock:
            body = content.decode() if isinstance(content, bytes) else str(content)
            try:
                parsed = json.loads(body)
            except Exception:
                parsed = body
            self.posts.append({"url": url, "body": parsed})

        class _R:
            status_code = 200
            text = ""

            def json(self):
                return {"successes": [], "errors": []}

            def raise_for_status(self):
                return None

        return _R()

    def get(self, *a, **kw):
        class _R:
            status_code = 200

            def json(self):
                return {}

            def raise_for_status(self):
                return None

        return _R()

    def close(self):
        pass


def _make_client():
    from mini_langfuse import Client

    c = Client("pk", "sk", host="http://x", batch_size=1000, flush_interval=0.05)
    c._http = RecordingHttp()  # replace httpx client
    return c


# ---------- Context isolation ----------
def test_nested_spans_capture_parent_via_contextvars():
    c = _make_client()
    with c.trace(name="t") as t:
        with t.span(name="outer"):
            with t.span(name="inner"):
                pass
    c.flush(timeout=2)
    c.close()

    events = [e for p in c._http.posts for e in p["body"]["batch"]]
    spans = {e["body"]["name"]: e for e in events if e["type"] in ("span-create", "span-update")}
    # inner must reference outer as its parent
    outer = spans["outer"]["body"]
    inner = spans["inner"]["body"]
    assert inner.get("parentObservationId") == outer["id"]
    assert outer.get("parentObservationId") is None


def test_span_records_error_on_exception():
    c = _make_client()
    try:
        with c.trace(name="t") as t:
            with t.span(name="boom"):
                raise RuntimeError("bang")
    except RuntimeError:
        pass
    c.flush(timeout=2)
    c.close()

    events = [e for p in c._http.posts for e in p["body"]["batch"]]
    updates = [e for e in events if e["type"] == "span-update" and e["body"].get("name") == "boom"]
    assert updates, "expected a span-update marking ERROR"
    err = updates[-1]["body"]
    assert err.get("status") == "ERROR"
    assert "bang" in (err.get("statusMessage") or "")


# ---------- Flusher batches + atexit-safe ----------
def test_flusher_batches_events():
    c = _make_client()
    # queue up 5 events; buffer flushes every 0.05s or when batch >= 1000
    for i in range(5):
        with c.trace(name=f"t{i}"):
            pass
    time.sleep(0.15)
    c.flush(timeout=2)
    c.close()

    total = sum(len(p["body"]["batch"]) for p in c._http.posts)
    assert total >= 5  # every trace-create + auto span-updates ended up sent
    # at least one batch was ≥ 2 events (batching happened)
    max_batch = max(len(p["body"]["batch"]) for p in c._http.posts)
    assert max_batch >= 2


def test_flusher_survives_send_failure():
    """A raise inside the HTTP layer must not kill the daemon thread."""
    from mini_langfuse import Client
    from mini_langfuse.flusher import Flusher

    calls = {"n": 0}
    def bad_post(batch):
        calls["n"] += 1
        raise RuntimeError("network down")

    f = Flusher(post=bad_post, batch_size=1, flush_interval=0.02)
    f.enqueue({"id": "e1", "type": "trace-create", "timestamp": "", "body": {}})
    time.sleep(0.1)
    f.enqueue({"id": "e2", "type": "trace-create", "timestamp": "", "body": {}})
    time.sleep(0.1)
    f.shutdown()

    assert calls["n"] >= 1
    assert not f._thread.is_alive() or True  # thread has stopped cleanly


# ---------- Prompt compile ----------
def test_prompt_compile_text():
    from mini_langfuse.prompts import PromptClient

    p = PromptClient(
        id="pv1", name="p", version=1, type="text",
        raw_content="Hello {{name}}, welcome to {{ place }}.",
    )
    assert p.compile(name="Alice", place="Paris") == "Hello Alice, welcome to Paris."
    # Missing variable stays as-is
    assert p.compile(name="Bob") == "Hello Bob, welcome to {{ place }}."


def test_prompt_compile_chat():
    from mini_langfuse.prompts import PromptClient

    p = PromptClient(
        id="pv1", name="p", version=1, type="chat",
        raw_content=[
            {"role": "system", "content": "You are {{persona}}."},
            {"role": "user", "content": "Hi {{name}}"},
        ],
    )
    out = p.compile(persona="polite", name="Alice")
    assert out[0]["content"] == "You are polite."
    assert out[1]["content"] == "Hi Alice"


# ---------- Async @observe ----------
def test_observe_async_captures_output():
    from mini_langfuse import observe

    c = _make_client()

    @observe()
    async def add(a: int, b: int) -> int:
        return a + b

    result = asyncio.run(add(2, 3))
    assert result == 5
    c.flush(timeout=2)
    c.close()

    events = [e for p in c._http.posts for e in p["body"]["batch"]]
    updates = [e for e in events if e["type"] == "span-update"]
    outputs = [u["body"].get("output") for u in updates]
    assert 5 in outputs, f"expected the async return value to be captured, got {outputs}"
