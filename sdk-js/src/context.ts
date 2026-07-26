/**
 * Async context propagation for trace/span hierarchy.
 *
 * In Node.js 18+, uses AsyncLocalStorage for proper async context.
 * In browsers, falls back to a simple global variable (single-threaded).
 */

let asyncLocalStorage: any = null;

// Try to use AsyncLocalStorage in Node.js
try {
  if (typeof globalThis !== "undefined" && (globalThis as any).AsyncLocalStorage) {
    asyncLocalStorage = new (globalThis as any).AsyncLocalStorage();
  } else if (typeof require !== "undefined") {
    try {
      const { AsyncLocalStorage } = require("async_hooks");
      asyncLocalStorage = new AsyncLocalStorage();
    } catch {
      // async_hooks not available
    }
  }
} catch {
  // Not in Node.js or async_hooks not available
}

interface ContextStore {
  traceId: string | null;
  spanId: string | null;
}

// Fallback for browsers (single-threaded)
let browserContext: ContextStore = { traceId: null, spanId: null };

/**
 * Get the current trace ID from context.
 */
export function getCurrentTraceId(): string | null {
  if (asyncLocalStorage) {
    const store = asyncLocalStorage.getStore() as ContextStore | undefined;
    return store?.traceId ?? null;
  }
  return browserContext.traceId;
}

/**
 * Get the current span ID from context.
 */
export function getCurrentSpanId(): string | null {
  if (asyncLocalStorage) {
    const store = asyncLocalStorage.getStore() as ContextStore | undefined;
    return store?.spanId ?? null;
  }
  return browserContext.spanId;
}

/**
 * Run a function within a trace context.
 */
export function runInTraceContext<T>(traceId: string, fn: () => T): T {
  if (asyncLocalStorage) {
    const store: ContextStore = { traceId, spanId: null };
    return asyncLocalStorage.run(store, fn);
  }
  // Browser fallback
  const prev = browserContext;
  browserContext = { traceId, spanId: null };
  try {
    return fn();
  } finally {
    browserContext = prev;
  }
}

/**
 * Run a function within a span context.
 */
export function runInSpanContext<T>(spanId: string, fn: () => T): T {
  if (asyncLocalStorage) {
    const parent = asyncLocalStorage.getStore() as ContextStore | undefined;
    const store: ContextStore = {
      traceId: parent?.traceId ?? null,
      spanId,
    };
    return asyncLocalStorage.run(store, fn);
  }
  // Browser fallback
  const prev = browserContext;
  browserContext = { ...browserContext, spanId };
  try {
    return fn();
  } finally {
    browserContext = prev;
  }
}
