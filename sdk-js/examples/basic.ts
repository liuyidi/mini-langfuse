/**
 * Basic Mini Langfuse JS SDK example.
 *
 * Run: npx tsx examples/basic.ts
 */
import { MiniLangfuse } from "../src";

async function main() {
  const client = new MiniLangfuse({
    publicKey: "pk-lf-demo",
    secretKey: "sk-lf-demo",
    baseUrl: "http://localhost:8000",
    debug: true,
  });

  // Create a trace
  const trace = client.trace({
    name: "customer-chat",
    userId: "user-alice",
    sessionId: "session-001",
    tags: ["production", "v2"],
    input: { question: "Where is my order?" },
  });

  console.log("Trace ID:", trace.id);

  // Create a span for retrieval
  const span = trace.span({
    name: "retrieve-context",
    input: { query: "order status" },
  });

  // Simulate some work
  await sleep(50);
  span.end({ output: { results: ["order-12345", "shipping-info"] } });

  // Create a generation
  const gen = trace.generation({
    name: "generate-response",
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: "You are a helpful customer support agent." },
      { role: "user", content: "Where is my order #12345?" },
    ],
    modelParameters: { temperature: 0.7 },
  });

  await sleep(100);
  gen.end({
    output: "Your order #12345 is currently in transit and expected to arrive by Friday.",
    usage: { promptTokens: 25, completionTokens: 18, totalTokens: 43 },
  });

  // Score the trace
  await client.score({
    name: "helpfulness",
    traceId: trace.id,
    value: 4,
    dataType: "NUMERIC",
    source: "API",
    comment: "Good response, addressed the question directly",
  });

  // Update the trace with output
  trace.update({
    output: "Your order #12345 is currently in transit and expected to arrive by Friday.",
  });

  // Flush and shutdown
  await client.flush();
  console.log("Done! Check http://localhost:8080 for traces.");
  await client.shutdown();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch(console.error);
