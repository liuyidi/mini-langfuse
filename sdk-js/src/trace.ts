/**
 * Trace and Span classes for the Mini Langfuse SDK.
 */

import {
  TraceOptions,
  TraceUpdateOptions,
  SpanOptions,
  SpanUpdateOptions,
  GenerationOptions,
  GenerationUpdateOptions,
  Usage,
  IngestionEvent,
} from "./types";
import { newId, utcNow, toCamel } from "./utils";
import { getCurrentSpanId, runInSpanContext } from "./context";

type EnqueueFn = (event: IngestionEvent) => void;

// =============================================================================
// Observation (Span / Generation)
// =============================================================================

export class Observation {
  readonly id: string;
  readonly traceId: string;
  readonly type: "SPAN" | "GENERATION" | "EVENT";
  private ended = false;
  private enqueue: EnqueueFn;

  constructor(
    id: string,
    traceId: string,
    type: "SPAN" | "GENERATION" | "EVENT",
    enqueue: EnqueueFn,
  ) {
    this.id = id;
    this.traceId = traceId;
    this.type = type;
    this.enqueue = enqueue;
  }

  /**
   * Update this observation with new data.
   */
  update(fields: SpanUpdateOptions | GenerationUpdateOptions): void {
    const body = toCamel({
      id: this.id,
      trace_id: this.traceId,
      ...fields,
    });
    const eventType =
      this.type === "SPAN"
        ? "span-update"
        : this.type === "GENERATION"
        ? "generation-update"
        : "event-create";

    this.enqueue({
      id: newId("evt_"),
      type: eventType,
      timestamp: utcNow(),
      body: body as Record<string, unknown>,
    });
  }

  /**
   * End this observation.
   */
  end(fields?: SpanUpdateOptions | GenerationUpdateOptions): void {
    if (this.ended) return;
    this.ended = true;
    this.update({
      endTime: new Date().toISOString(),
      status: "OK",
      ...fields,
    } as any);
  }

  /**
   * Mark this observation as failed.
   */
  fail(error: Error | string, fields?: SpanUpdateOptions): void {
    if (this.ended) return;
    this.ended = true;
    const msg = error instanceof Error ? error.message : error;
    this.update({
      endTime: new Date().toISOString(),
      status: "ERROR",
      statusMessage: msg,
      level: "ERROR",
      ...fields,
    } as any);
  }

  /**
   * Create a child span within this observation.
   */
  span(options: SpanOptions = {}): Observation {
    return createObservation(this.traceId, this.id, "SPAN", this.enqueue, options);
  }

  /**
   * Create a child generation within this observation.
   */
  generation(options: GenerationOptions = {}): Observation {
    return createObservation(this.traceId, this.id, "GENERATION", this.enqueue, options);
  }
}

// =============================================================================
// Trace
// =============================================================================

export class Trace {
  readonly id: string;
  private enqueue: EnqueueFn;

  constructor(id: string, enqueue: EnqueueFn) {
    this.id = id;
    this.enqueue = enqueue;
  }

  /**
   * Update this trace with new data.
   */
  update(fields: TraceUpdateOptions): void {
    const body = toCamel({
      id: this.id,
      ...fields,
    });
    this.enqueue({
      id: newId("evt_"),
      type: "trace-create",
      timestamp: utcNow(),
      body: body as Record<string, unknown>,
    });
  }

  /**
   * Create a span within this trace.
   */
  span(options: SpanOptions = {}): Observation {
    return createObservation(this.id, null, "SPAN", this.enqueue, options);
  }

  /**
   * Create a generation within this trace.
   */
  generation(options: GenerationOptions = {}): Observation {
    return createObservation(this.id, null, "GENERATION", this.enqueue, options);
  }

  /**
   * Run a function within this trace's context.
   */
  async run<T>(fn: (trace: Trace) => T | Promise<T>): Promise<T> {
    const { runInTraceContext } = await import("./context");
    return runInTraceContext(this.id, () => fn(this));
  }
}

// =============================================================================
// Helpers
// =============================================================================

function createObservation(
  traceId: string,
  parentId: string | null,
  type: "SPAN" | "GENERATION" | "EVENT",
  enqueue: EnqueueFn,
  options: SpanOptions | GenerationOptions,
): Observation {
  const id = newId("obs_");
  const now = utcNow();

  // Detect parent from context if not explicitly provided
  const parentObservationId = parentId ?? getCurrentSpanId();

  const body = toCamel({
    id,
    trace_id: traceId,
    parent_observation_id: parentObservationId,
    type,
    name: options.name,
    start_time: now,
    input: options.input,
    metadata: options.metadata,
    ...(type === "GENERATION"
      ? {
          model: (options as GenerationOptions).model,
          model_parameters: (options as GenerationOptions).modelParameters,
          prompt_version_id: (options as GenerationOptions).promptVersionId,
        }
      : {}),
  });

  const eventType =
    type === "SPAN"
      ? "span-create"
      : type === "GENERATION"
      ? "generation-create"
      : "event-create";

  enqueue({
    id: newId("evt_"),
    type: eventType,
    timestamp: now,
    body: body as Record<string, unknown>,
  });

  return new Observation(id, traceId, type, enqueue);
}
