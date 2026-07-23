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
  total_cost_usd: number | null;
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

async function req<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { Authorization: authHeader } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

export const api = {
  listTraces: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req<TraceListResponse>(`/api/public/traces${qs ? "?" + qs : ""}`);
  },
  getTrace: (id: string) => req<TraceDetail>(`/api/public/traces/${id}`),
};
