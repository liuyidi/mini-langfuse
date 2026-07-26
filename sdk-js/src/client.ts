/**
 * Mini Langfuse JavaScript/TypeScript SDK Client.
 *
 * Usage:
 *   const client = new MiniLangfuse({
 *     publicKey: "pk-lf-xxx",
 *     secretKey: "sk-lf-xxx",
 *   });
 *
 *   const trace = client.trace({ name: "chat", userId: "u1" });
 *   const span = trace.span({ name: "retrieve" });
 *   span.end({ output: "result" });
 */

import {
  MiniLangfuseConfig,
  TraceOptions,
  ScoreOptions,
  PromptCreateOptions,
  PromptResolveOptions,
  ResolvedPrompt,
  IngestionEvent,
} from "./types";
import { newId, utcNow, toCamel, safeStringify } from "./utils";
import { Flusher } from "./flusher";
import { Trace, Observation } from "./trace";
import { getCurrentTraceId, getCurrentSpanId, runInTraceContext } from "./context";

export class MiniLangfuse {
  private config: Required<MiniLangfuseConfig>;
  private authHeader: string;
  private flusher: Flusher;
  private static defaultInstance: MiniLangfuse | null = null;

  constructor(config: MiniLangfuseConfig) {
    this.config = {
      publicKey: config.publicKey,
      secretKey: config.secretKey,
      baseUrl: config.baseUrl ?? "http://localhost:8000",
      batchSize: config.batchSize ?? 50,
      flushInterval: config.flushInterval ?? 1000,
      enabled: config.enabled ?? true,
      debug: config.debug ?? false,
    };

    this.authHeader =
      "Basic " + btoa(`${this.config.publicKey}:${this.config.secretKey}`);

    this.flusher = new Flusher(
      (batch) => this.postBatch(batch),
      this.config.batchSize,
      this.config.flushInterval,
      10000,
      this.config.debug,
    );

    MiniLangfuse.defaultInstance = this;
  }

  /**
   * Get the default (most recently created) client instance.
   */
  static getDefault(): MiniLangfuse | null {
    return MiniLangfuse.defaultInstance;
  }

  // ===========================================================================
  // Trace API
  // ===========================================================================

  /**
   * Create a new trace.
   */
  trace(options: TraceOptions = {}): Trace {
    const id = newId("trace_");
    const now = utcNow();

    const body = toCamel({
      id,
      name: options.name,
      user_id: options.userId,
      session_id: options.sessionId,
      input: options.input,
      metadata: options.metadata,
      tags: options.tags,
      release: options.release,
      version: options.version,
      timestamp: now,
    });

    this.enqueue({
      id: newId("evt_"),
      type: "trace-create",
      timestamp: now,
      body: body as Record<string, unknown>,
    });

    return new Trace(id, (event) => this.enqueue(event));
  }

  /**
   * Create a trace and run a function within its context.
   * The trace is automatically ended when the function completes.
   */
  async withTrace<T>(
    options: TraceOptions,
    fn: (trace: Trace) => T | Promise<T>,
  ): Promise<T> {
    const trace = this.trace(options);
    return runInTraceContext(trace.id, async () => {
      try {
        const result = await fn(trace);
        trace.update({ output: result });
        return result;
      } catch (error) {
        trace.update({
          output: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });
  }

  // ===========================================================================
  // Observation helpers (using current context)
  // ===========================================================================

  /**
   * Create a span within the current trace context.
   */
  span(options: { name?: string; input?: unknown } = {}): Observation | null {
    const traceId = getCurrentTraceId();
    if (!traceId) {
      if (this.config.debug) {
        console.warn("[mini-langfuse] No active trace context for span()");
      }
      return null;
    }
    const trace = new Trace(traceId, (event) => this.enqueue(event));
    return trace.span(options);
  }

  /**
   * Create a generation within the current trace context.
   */
  generation(
    options: {
      name?: string;
      model?: string;
      input?: unknown;
      modelParameters?: Record<string, unknown>;
    } = {},
  ): Observation | null {
    const traceId = getCurrentTraceId();
    if (!traceId) {
      if (this.config.debug) {
        console.warn("[mini-langfuse] No active trace context for generation()");
      }
      return null;
    }
    const trace = new Trace(traceId, (event) => this.enqueue(event));
    return trace.generation(options);
  }

  // ===========================================================================
  // Score API
  // ===========================================================================

  /**
   * Create a score (synchronous POST).
   */
  async score(options: ScoreOptions): Promise<unknown> {
    const body = toCamel({
      name: options.name,
      trace_id: options.traceId,
      observation_id: options.observationId,
      data_type: options.dataType ?? "NUMERIC",
      value: options.value,
      string_value: options.stringValue,
      source: options.source ?? "API",
      comment: options.comment,
    });

    // Filter out undefined values
    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) payload[k] = v;
    }

    const resp = await fetch(`${this.config.baseUrl}/api/public/scores`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: safeStringify(payload),
    });

    if (!resp.ok) {
      throw new Error(`Score creation failed: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  // ===========================================================================
  // Prompt API
  // ===========================================================================

  /**
   * Create a new prompt or prompt version.
   */
  async createPrompt(options: PromptCreateOptions): Promise<unknown> {
    const body = toCamel({
      name: options.name,
      content: options.content,
      type: options.type ?? "text",
      config: options.config,
      labels: options.labels,
      commit_message: options.commitMessage,
      created_by: options.createdBy,
    });

    const payload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) payload[k] = v;
    }

    const resp = await fetch(`${this.config.baseUrl}/api/public/prompts`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: safeStringify(payload),
    });

    if (!resp.ok) {
      throw new Error(`Prompt creation failed: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  /**
   * Resolve a prompt by name and optional version/label.
   */
  async getPrompt(
    name: string,
    options: PromptResolveOptions = {},
  ): Promise<ResolvedPrompt> {
    const params: string[] = [];
    if (options.version !== undefined) params.push(`version=${options.version}`);
    if (options.label) params.push(`label=${options.label}`);
    const qs = params.length ? "?" + params.join("&") : "";

    const resp = await fetch(
      `${this.config.baseUrl}/api/public/prompts/${encodeURIComponent(name)}/resolve${qs}`,
      {
        headers: { Authorization: this.authHeader },
      },
    );

    if (!resp.ok) {
      throw new Error(`Prompt resolve failed: ${resp.status} ${await resp.text()}`);
    }
    return resp.json();
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Flush all pending events.
   */
  async flush(timeoutMs = 5000): Promise<void> {
    await this.flusher.flush(timeoutMs);
  }

  /**
   * Shutdown the client and flush remaining events.
   */
  async shutdown(timeoutMs = 5000): Promise<void> {
    await this.flusher.shutdown(timeoutMs);
  }

  // ===========================================================================
  // Internal
  // ===========================================================================

  private enqueue(event: IngestionEvent): void {
    if (!this.config.enabled) return;
    this.flusher.enqueue(event);
  }

  private async postBatch(batch: IngestionEvent[]): Promise<void> {
    const resp = await fetch(`${this.config.baseUrl}/api/public/ingestion`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: safeStringify({ batch }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `[mini-langfuse] Ingestion failed (${resp.status}): ${text.substring(0, 200)}`,
      );
    }
  }
}
