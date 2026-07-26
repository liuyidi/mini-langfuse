/**
 * Core type definitions for Mini Langfuse JS SDK.
 */

// =============================================================================
// Trace types
// =============================================================================

export interface TraceOptions {
  name?: string;
  userId?: string;
  sessionId?: string;
  input?: unknown;
  metadata?: unknown;
  tags?: string[];
  release?: string;
  version?: string;
}

export interface TraceUpdateOptions {
  name?: string;
  userId?: string;
  sessionId?: string;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  tags?: string[];
  release?: string;
  version?: string;
}

// =============================================================================
// Observation types
// =============================================================================

export interface SpanOptions {
  name?: string;
  input?: unknown;
  metadata?: unknown;
}

export interface SpanUpdateOptions {
  name?: string;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  status?: "OK" | "ERROR";
  statusMessage?: string;
  level?: "DEFAULT" | "DEBUG" | "WARNING" | "ERROR";
}

export interface GenerationOptions extends SpanOptions {
  model?: string;
  modelParameters?: Record<string, unknown>;
  promptVersionId?: string;
}

export interface GenerationUpdateOptions extends SpanUpdateOptions {
  model?: string;
  modelParameters?: Record<string, unknown>;
  promptVersionId?: string;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

// =============================================================================
// Score types
// =============================================================================

export type ScoreDataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
export type ScoreSource = "HUMAN" | "API" | "EVAL";

export interface ScoreOptions {
  name: string;
  traceId: string;
  observationId?: string;
  dataType?: ScoreDataType;
  value?: number;
  stringValue?: string;
  source?: ScoreSource;
  comment?: string;
}

// =============================================================================
// Prompt types
// =============================================================================

export interface PromptCreateOptions {
  name: string;
  content: unknown;
  type?: "text" | "chat";
  config?: unknown;
  labels?: string[];
  commitMessage?: string;
  createdBy?: string;
}

export interface PromptResolveOptions {
  version?: number;
  label?: string;
}

export interface ResolvedPrompt {
  id: string;
  name: string;
  version: number;
  type: string;
  content: unknown;
  labels?: string[];
  config?: unknown;
}

// =============================================================================
// Client config
// =============================================================================

export interface MiniLangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  batchSize?: number;
  flushInterval?: number;
  enabled?: boolean;
  debug?: boolean;
}

// =============================================================================
// Ingestion event types
// =============================================================================

export interface IngestionEvent {
  id: string;
  type: string;
  timestamp: string;
  body: Record<string, unknown>;
}
