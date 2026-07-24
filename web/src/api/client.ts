// M1: hardcoded demo credentials. Real app should let user pick per-project.
const DEMO_PK = "pk-lf-demo";
const DEMO_SK = "sk-lf-demo";
const authHeader = "Basic " + btoa(`${DEMO_PK}:${DEMO_SK}`);

export type Observation = {
  id: string;
  trace_id: string;
  parent_observation_id: string | null;
  type: "SPAN" | "GENERATION" | "EVENT";
  name: string | null;
  start_time: string;
  end_time: string | null;
  status: string | null;
  status_message: string | null;
  level: string | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
  model: string | null;
  model_parameters: unknown;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  input_cost_usd: number | null;
  output_cost_usd: number | null;
  total_cost_usd: number | null;
  prompt_version_id: string | null;
  children: Observation[];
};

export type Trace = {
  id: string;
  project_id: string;
  name: string | null;
  user_id: string | null;
  session_id: string | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
  tags: string[] | null;
  release: string | null;
  version: string | null;
  timestamp: string;
  created_at: string;
  duration_ms: number | null;
  total_tokens: number | null;
  total_cost_usd: number | null;
  observation_count: number;
};

export type TraceDetail = Trace & { observations: Observation[] };

export type TraceListResponse = {
  data: Trace[];
  total: number;
  page: number;
  limit: number;
};

export type SessionSummary = {
  session_id: string;
  user_id: string | null;
  trace_count: number;
  first_trace_at: string;
  last_trace_at: string;
  total_tokens: number | null;
  total_cost_usd: number | null;
};

export type SessionListResponse = {
  data: SessionSummary[];
  total: number;
  page: number;
  limit: number;
};

export type SessionDetail = SessionSummary & { traces: Trace[] };

export type Score = {
  id: string;
  trace_id: string;
  observation_id: string | null;
  name: string;
  data_type: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
  value: number | null;
  string_value: string | null;
  source: "HUMAN" | "API" | "EVAL";
  comment: string | null;
  created_at: string;
};

export type ScoreListResponse = { data: Score[]; total: number };

export type PromptVersion = {
  id: string;
  prompt_id: string;
  version: number;
  type: "text" | "chat";
  content: unknown;
  config: unknown | null;
  labels: string[] | null;
  commit_msg: string | null;
  created_by: string | null;
  created_at: string;
};

export type PromptSummary = {
  id: string;
  name: string;
  latest_version: number | null;
  latest_labels: string[] | null;
  created_at: string;
};

export type PromptListResponse = { data: PromptSummary[]; total: number };
export type PromptDetail = PromptSummary & { versions: PromptVersion[] };

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

export const api = {
  listTraces: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req<TraceListResponse>(`/api/public/traces${qs ? "?" + qs : ""}`);
  },
  getTrace: (id: string) => req<TraceDetail>(`/api/public/traces/${id}`),
  listSessions: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req<SessionListResponse>(`/api/public/sessions${qs ? "?" + qs : ""}`);
  },
  getSession: (id: string) => req<SessionDetail>(`/api/public/sessions/${id}`),

  listScores: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req<ScoreListResponse>(`/api/public/scores${qs ? "?" + qs : ""}`);
  },
  createScore: (body: {
    traceId: string;
    name: string;
    dataType?: "NUMERIC" | "CATEGORICAL" | "BOOLEAN";
    value?: number | null;
    stringValue?: string | null;
    observationId?: string | null;
    source?: "HUMAN" | "API" | "EVAL";
    comment?: string | null;
  }) =>
    req<Score>(`/api/public/scores`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listPrompts: () => req<PromptListResponse>(`/api/public/prompts`),
  getPrompt: (name: string) =>
    req<PromptDetail>(`/api/public/prompts/${encodeURIComponent(name)}`),
  updatePromptLabels: (versionId: string, labels: string[]) =>
    req<PromptVersion>(
      `/api/public/prompt-versions/${versionId}/labels`,
      { method: "PATCH", body: JSON.stringify({ labels }) },
    ),
};
