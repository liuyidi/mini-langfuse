/**
 * Decorator-style wrappers for automatic tracing.
 *
 * Usage:
 *   const client = new MiniLangfuse({ ... });
 *
 *   // Wrap a function to auto-trace
 *   const tracedFn = observe(client, "myFunction", async (x) => {
 *     return x * 2;
 *   });
 *
 *   // Or as a higher-order function
 *   const traced = observeAsGeneration(client, "gpt-call", async (prompt) => {
 *     return await callLLM(prompt);
 *   }, { model: "gpt-4o-mini" });
 */

import { MiniLangfuse } from "./client";
import { Observation } from "./trace";
import { runInTraceContext, runInSpanContext } from "./context";

/**
 * Wrap a function to automatically create a span.
 */
export function observeSpan<F extends (...args: any[]) => any>(
  client: MiniLangfuse,
  name: string,
  fn: F,
): F {
  const wrapped = async function (this: any, ...args: any[]) {
    let trace: any;
    const { getCurrentTraceId } = await import("./context");
    const traceId = getCurrentTraceId();

    if (!traceId) {
      // Auto-create a trace
      trace = client.trace({ name });
      return runInTraceContext(trace.id, async () => {
        const span = trace.span({ name, input: args.length === 1 ? args[0] : args });
        try {
          const result = await fn.apply(this, args);
          span.end({ output: result });
          return result;
        } catch (error) {
          span.fail(error as Error);
          throw error;
        }
      });
    }

    // Use existing trace
    const span = client.span({ name, input: args.length === 1 ? args[0] : args });
    if (!span) return fn.apply(this, args);

    return runInSpanContext(span.id, async () => {
      try {
        const result = await fn.apply(this, args);
        span.end({ output: result });
        return result;
      } catch (error) {
        span.fail(error as Error);
        throw error;
      }
    });
  };

  return wrapped as unknown as F;
}

/**
 * Wrap a function to automatically create a generation.
 */
export function observeGeneration<F extends (...args: any[]) => any>(
  client: MiniLangfuse,
  name: string,
  fn: F,
  options: { model?: string; modelParameters?: Record<string, unknown> } = {},
): F {
  const wrapped = async function (this: any, ...args: any[]) {
    const { getCurrentTraceId } = await import("./context");
    const traceId = getCurrentTraceId();

    if (!traceId) {
      const trace = client.trace({ name });
      return runInTraceContext(trace.id, async () => {
        const gen = trace.generation({
          name,
          model: options.model,
          modelParameters: options.modelParameters,
          input: args.length === 1 ? args[0] : args,
        });
        try {
          const result = await fn.apply(this, args);
          gen.end({ output: result });
          return result;
        } catch (error) {
          gen.fail(error as Error);
          throw error;
        }
      });
    }

    const gen = client.generation({
      name,
      model: options.model,
      modelParameters: options.modelParameters,
      input: args.length === 1 ? args[0] : args,
    });
    if (!gen) return fn.apply(this, args);

    return runInSpanContext(gen.id, async () => {
      try {
        const result = await fn.apply(this, args);
        gen.end({ output: result });
        return result;
      } catch (error) {
        gen.fail(error as Error);
        throw error;
      }
    });
  };

  return wrapped as unknown as F;
}

// Convenience aliases
export const observe = observeSpan;
export const observeAsGeneration = observeGeneration;
