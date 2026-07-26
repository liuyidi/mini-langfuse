/**
 * @mini-langfuse/js — Mini Langfuse JavaScript/TypeScript SDK
 *
 * LLM observability: trace, span, generation, scoring, and prompt management.
 *
 * @example
 * ```typescript
 * import { MiniLangfuse } from "@mini-langfuse/js";
 *
 * const client = new MiniLangfuse({
 *   publicKey: "pk-lf-xxx",
 *   secretKey: "sk-lf-xxx",
 * });
 *
 * const trace = client.trace({ name: "chat", userId: "u1" });
 * const span = trace.span({ name: "retrieve" });
 * span.end({ output: { results: [...] } });
 *
 * const gen = trace.generation({ name: "gpt-call", model: "gpt-4o-mini" });
 * gen.end({ output: "Hello!", usage: { promptTokens: 5, completionTokens: 2 } });
 *
 * await client.flush();
 * ```
 */

export { MiniLangfuse } from "./client";
export { Trace, Observation } from "./trace";
export { Flusher } from "./flusher";
export { observe, observeAsGeneration, observeSpan, observeGeneration } from "./decorators";
export { getCurrentTraceId, getCurrentSpanId, runInTraceContext, runInSpanContext } from "./context";
export { newId, utcNow, safeStringify } from "./utils";

export type {
  MiniLangfuseConfig,
  TraceOptions,
  TraceUpdateOptions,
  SpanOptions,
  SpanUpdateOptions,
  GenerationOptions,
  GenerationUpdateOptions,
  Usage,
  ScoreOptions,
  ScoreDataType,
  ScoreSource,
  PromptCreateOptions,
  PromptResolveOptions,
  ResolvedPrompt,
  IngestionEvent,
} from "./types";
