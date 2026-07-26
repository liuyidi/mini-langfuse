# @mini-langfuse/js

Mini Langfuse JavaScript/TypeScript SDK for LLM observability.

## Install

```bash
npm install @mini-langfuse/js
```

## Quick Start

```typescript
import { MiniLangfuse } from "@mini-langfuse/js";

const client = new MiniLangfuse({
  publicKey: "pk-lf-demo",
  secretKey: "sk-lf-demo",
  baseUrl: "http://localhost:8000",
});

// Create a trace
const trace = client.trace({
  name: "customer-chat",
  userId: "user-123",
  sessionId: "session-456",
  tags: ["production"],
});

// Create spans
const span = trace.span({ name: "retrieve-context", input: { query: "..." } });
span.end({ output: { results: ["doc1", "doc2"] } });

// Create generations
const gen = trace.generation({
  name: "gpt-4o-call",
  model: "gpt-4o-mini",
  input: [{ role: "user", content: "Hello" }],
  modelParameters: { temperature: 0.7 },
});
gen.end({
  output: "Hi there!",
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
});

// Score a trace
await client.score({
  name: "helpfulness",
  traceId: trace.id,
  value: 4,
  dataType: "NUMERIC",
  source: "API",
});

// Flush before process exit
await client.flush();
```

## API Reference

### `MiniLangfuse`

```typescript
new MiniLangfuse({
  publicKey: string;      // Required
  secretKey: string;      // Required
  baseUrl?: string;       // Default: "http://localhost:8000"
  batchSize?: number;     // Default: 50
  flushInterval?: number; // Default: 1000ms
  enabled?: boolean;      // Default: true
  debug?: boolean;        // Default: false
})
```

### Methods

| Method | Description |
|--------|-------------|
| `trace(options?)` | Create a new trace |
| `withTrace(options, fn)` | Create trace + run function in context |
| `span(options?)` | Create span in current trace context |
| `generation(options?)` | Create generation in current trace context |
| `score(options)` | Post a score (synchronous) |
| `createPrompt(options)` | Create a prompt version |
| `getPrompt(name, options?)` | Resolve a prompt |
| `flush(timeout?)` | Flush pending events |
| `shutdown(timeout?)` | Shutdown and flush |

### Trace

| Method | Description |
|--------|-------------|
| `trace.update(fields)` | Update trace fields |
| `trace.span(options?)` | Create a child span |
| `trace.generation(options?)` | Create a child generation |
| `trace.run(fn)` | Run function in trace context |

### Observation (Span / Generation)

| Method | Description |
|--------|-------------|
| `obs.update(fields)` | Update observation |
| `obs.end(fields?)` | End with optional final fields |
| `obs.fail(error, fields?)` | Mark as failed |
| `obs.span(options?)` | Create child span |
| `obs.generation(options?)` | Create child generation |

## Auto-tracing with observe

```typescript
import { MiniLangfuse, observeSpan, observeGeneration } from "@mini-langfuse/js";

const client = new MiniLangfuse({ publicKey: "pk-lf-xxx", secretKey: "sk-lf-xxx" });

// Wrap any function
const retrieve = observeSpan(client, "retrieve", async (query: string) => {
  return await searchIndex(query);
});

const generate = observeGeneration(client, "generate", async (prompt: string) => {
  return await callLLM(prompt);
}, { model: "gpt-4o-mini" });

// Call normally — tracing happens automatically
await retrieve("What is Langfuse?");
await generate("Explain quantum computing");
```

## Async Context

The SDK uses `AsyncLocalStorage` (Node.js 18+) for automatic parent-child
relationship tracking. In browsers, it falls back to global state.

```typescript
import { MiniLangfuse, getCurrentTraceId, getCurrentSpanId } from "@mini-langfuse/js";

const client = new MiniLangfuse({ ... });

const trace = client.trace({ name: "agent-loop" });

await trace.run(async () => {
  // Inside this block, getCurrentTraceId() returns trace.id
  const span = client.span({ name: "step-1" }); // Auto-parented
  // ...
});
```

## Browser Usage

The SDK works in browsers using the native `fetch` API:

```typescript
import { MiniLangfuse } from "@mini-langfuse/js";

const client = new MiniLangfuse({
  publicKey: "pk-lf-xxx",
  secretKey: "sk-lf-xxx",
  baseUrl: "https://your-langfuse.example.com",
});
```

## License

MIT
