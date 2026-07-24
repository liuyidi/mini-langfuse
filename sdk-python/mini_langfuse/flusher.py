"""Background flusher: daemon thread that drains an events queue and POSTs
them to the ingestion endpoint in batches.

Design goals:
- Never block the caller. `enqueue()` is non-blocking.
- Batch by size *or* time, whichever hits first.
- Guarantee flush at interpreter exit (atexit hook).
- Ingestion failures are logged but never re-raised into user code.
"""
from __future__ import annotations

import atexit
import json
import logging
import queue
import threading
import time
from typing import Any, Callable

log = logging.getLogger("mini_langfuse")


class Flusher:
    def __init__(
        self,
        post: Callable[[list[dict[str, Any]]], None],
        batch_size: int = 50,
        flush_interval: float = 1.0,
        max_queue: int = 10_000,
    ) -> None:
        self._post = post
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._q: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=max_queue)
        self._stop = threading.Event()
        self._thread = threading.Thread(
            target=self._loop, name="mini-langfuse-flusher", daemon=True
        )
        self._thread.start()
        atexit.register(self.shutdown)

    def enqueue(self, event: dict[str, Any]) -> None:
        try:
            self._q.put_nowait(event)
        except queue.Full:
            log.warning("mini_langfuse: event queue full, dropping event %s", event.get("id"))

    def flush(self, timeout: float = 5.0) -> None:
        """Block until the current queue is drained (best effort)."""
        deadline = time.monotonic() + timeout
        while not self._q.empty() and time.monotonic() < deadline:
            time.sleep(0.02)

    def shutdown(self, timeout: float = 5.0) -> None:
        """Signal the thread to exit; drain remaining events first."""
        if self._stop.is_set():
            return
        self._stop.set()
        self._thread.join(timeout=timeout)

    # -------- internals --------
    def _loop(self) -> None:
        batch: list[dict[str, Any]] = []
        last_flush = time.monotonic()
        while not self._stop.is_set():
            try:
                evt = self._q.get(timeout=0.1)
                batch.append(evt)
            except queue.Empty:
                pass

            should_flush = (
                len(batch) >= self._batch_size
                or (batch and time.monotonic() - last_flush >= self._flush_interval)
            )
            if should_flush:
                self._send(batch)
                batch = []
                last_flush = time.monotonic()

        # Drain the rest on shutdown
        while True:
            try:
                batch.append(self._q.get_nowait())
            except queue.Empty:
                break
        if batch:
            self._send(batch)

    def _send(self, batch: list[dict[str, Any]]) -> None:
        try:
            self._post(batch)
        except Exception as exc:  # noqa: BLE001
            log.warning("mini_langfuse flush failed: %s", exc)


def json_dumps(obj: Any) -> str:
    """JSON with a default fallback so datetimes / dataclasses serialize."""
    return json.dumps(obj, default=str)
