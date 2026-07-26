/**
 * Basic unit tests for Mini Langfuse JS SDK.
 *
 * Run: node --test tests/basic.test.mjs
 */
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

// Test utils
import { newId, utcNow, safeStringify, toCamel } from "../src/utils.ts";

describe("utils", () => {
  it("newId generates unique IDs with prefix", () => {
    const id1 = newId("trace_");
    const id2 = newId("trace_");
    assert.ok(id1.startsWith("trace_"));
    assert.ok(id2.startsWith("trace_"));
    assert.notEqual(id1, id2);
  });

  it("utcNow returns ISO timestamp", () => {
    const ts = utcNow();
    assert.ok(ts.endsWith("Z") || ts.includes("+"));
    assert.ok(!isNaN(Date.parse(ts)));
  });

  it("toCamel converts snake_case to camelCase", () => {
    const result = toCamel({
      trace_id: "abc",
      user_id: "u1",
      name: "test",
    });
    assert.equal(result.traceId, "abc");
    assert.equal(result.userId, "u1");
    assert.equal(result.name, "test");
  });

  it("safeStringify handles circular refs", () => {
    const obj = { a: 1 };
    obj.self = obj;
    const result = safeStringify(obj);
    assert.ok(result.includes('"a":1'));
    assert.ok(result.includes("[Circular]"));
  });

  it("safeStringify handles Date objects", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    const result = safeStringify({ time: d });
    assert.ok(result.includes("2026-01-01"));
  });
});
