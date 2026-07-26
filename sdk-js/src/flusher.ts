/**
 * Background batch flusher for ingestion events.
 *
 * Design:
 * - Never blocks the caller. enqueue() is non-blocking.
 * - Batches by size or time, whichever hits first.
 * - Supports graceful shutdown via shutdown().
 * - Uses fetch API (works in both Node.js 18+ and browsers).
 */

import { IngestionEvent } from "./types";
import { safeStringify } from "./utils";

export type PostBatchFn = (batch: IngestionEvent[]) => Promise<void>;

export class Flusher {
  private queue: IngestionEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private flushing: Promise<void> | null = null;

  constructor(
    private postBatch: PostBatchFn,
    private batchSize = 50,
    private flushIntervalMs = 1000,
    private maxQueueSize = 10000,
    private debug = false,
  ) {
    // Setup process exit handler (Node.js only)
    if (typeof process !== "undefined" && process.on) {
      process.on("beforeExit", () => this.flushSync());
    }
  }

  /**
   * Add an event to the queue. Non-blocking.
   */
  enqueue(event: IngestionEvent): void {
    if (this.stopped) return;

    if (this.queue.length >= this.maxQueueSize) {
      if (this.debug) {
        console.warn("[mini-langfuse] Event queue full, dropping event");
      }
      return;
    }

    this.queue.push(event);

    if (this.queue.length >= this.batchSize) {
      this.scheduleFlush(0);
    } else if (!this.timer) {
      this.scheduleFlush(this.flushIntervalMs);
    }
  }

  /**
   * Flush all pending events. Returns when done.
   */
  async flush(timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (this.queue.length > 0 && Date.now() < deadline) {
      await this.doFlush();
      if (this.queue.length > 0) {
        await sleep(50);
      }
    }
  }

  /**
   * Stop the flusher and drain remaining events.
   */
  async shutdown(timeoutMs = 5000): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush(timeoutMs);
  }

  private scheduleFlush(delayMs: number): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped && this.queue.length > 0) {
        this.doFlush();
      }
    }, delayMs);
  }

  private async doFlush(): Promise<void> {
    if (this.queue.length === 0) return;
    if (this.flushing) {
      await this.flushing;
      return;
    }

    const batch = this.queue.splice(0, this.batchSize);
    this.flushing = (async () => {
      try {
        await this.postBatch(batch);
      } catch (err) {
        if (this.debug) {
          console.warn("[mini-langfuse] Batch flush failed:", err);
        }
      } finally {
        this.flushing = null;
      }
    })();

    await this.flushing;
  }

  /**
   * Synchronous flush for process exit handlers.
   * Best-effort only.
   */
  private flushSync(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.batchSize);

    // Use sendBeacon in browser, fire-and-forget fetch in Node
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const body = safeStringify({ batch });
      navigator.sendBeacon("/api/public/ingestion", body);
    }
    // In Node.js, beforeExit gives us a chance to complete the async flush
    // The shutdown() method handles this properly
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
