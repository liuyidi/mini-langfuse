/**
 * Utility functions for the Mini Langfuse SDK.
 */

/**
 * Generate a unique ID with a prefix.
 */
export function newId(prefix = ""): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return prefix + crypto.randomUUID().replace(/-/g, "").substring(0, 24);
  }
  // Fallback for environments without crypto
  const hex = Array.from({ length: 24 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return prefix + hex;
}

/**
 * Get current UTC timestamp in ISO format.
 */
export function utcNow(): string {
  return new Date().toISOString();
}

/**
 * Convert snake_case to camelCase for API field names.
 */
const CAMEL_MAP: Record<string, string> = {
  trace_id: "traceId",
  parent_observation_id: "parentObservationId",
  start_time: "startTime",
  end_time: "endTime",
  status_message: "statusMessage",
  model_parameters: "modelParameters",
  prompt_version_id: "promptVersionId",
  user_id: "userId",
  session_id: "sessionId",
  data_type: "dataType",
  string_value: "stringValue",
  commit_message: "commitMessage",
  created_by: "createdBy",
  expected_output: "expectedOutput",
};

export function toCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = CAMEL_MAP[key] || key;
    if (value !== undefined) {
      result[camelKey] = value;
    }
  }
  return result;
}

/**
 * Safe JSON stringify that handles circular references and Date objects.
 */
export function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  });
}
