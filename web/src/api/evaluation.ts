// Evaluation API client (M-Eval)

const DEMO_PK = "pk-lf-demo";
const DEMO_SK = "sk-lf-demo";
const authHeader = "Basic " + btoa(`${DEMO_PK}:${DEMO_SK}`);

async function evalReq<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export type Evaluator = {
  id: string;
  project_id: string;
  name: string;
  evaluator_type: string;
  config: {
    model?: string;
    provider?: string;
    prompt_template?: string;
    score_min?: number;
    score_max?: number;
    temperature?: number;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EvaluationRun = {
  id: string;
  project_id: string;
  evaluator_id: string;
  evaluator_name?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  filters: Record<string, unknown> | null;
  total_traces: number;
  completed_traces: number;
  failed_traces: number;
  avg_score: number | null;
  score_distribution: Record<string, number> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type EvaluationResult = {
  id: string;
  run_id: string;
  trace_id: string;
  evaluator_id: string;
  score_value: number | null;
  string_value: string | null;
  status: "pending" | "completed" | "failed";
  reasoning: string | null;
  error_message: string | null;
  created_at: string;
  trace_name?: string | null;
  trace_user_id?: string | null;
  trace_timestamp?: string | null;
};

export type EvaluationRunDetail = EvaluationRun & {
  results: EvaluationResult[];
};

export const evaluationApi = {
  // Evaluators
  listEvaluators: () => evalReq<Evaluator[]>("/api/public/evaluators"),

  getEvaluator: (id: string) => evalReq<Evaluator>(`/api/public/evaluators/${id}`),

  createEvaluator: (body: {
    name: string;
    evaluator_type?: string;
    config: Record<string, unknown>;
  }) =>
    evalReq<Evaluator>("/api/public/evaluators", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateEvaluator: (id: string, body: Partial<{ name: string; config: Record<string, unknown>; is_active: boolean }>) =>
    evalReq<Evaluator>(`/api/public/evaluators/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteEvaluator: (id: string) =>
    evalReq<{ ok: boolean }>(`/api/public/evaluators/${id}`, { method: "DELETE" }),

  // Evaluation Runs
  listRuns: (params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return evalReq<EvaluationRun[]>(`/api/public/evaluation-runs${qs}`);
  },

  getRun: (id: string) => evalReq<EvaluationRunDetail>(`/api/public/evaluation-runs/${id}`),

  createRun: (body: { evaluator_id: string; filters?: Record<string, unknown>; limit?: number }) =>
    evalReq<EvaluationRun>("/api/public/evaluation-runs", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  cancelRun: (id: string) =>
    evalReq<{ ok: boolean }>(`/api/public/evaluation-runs/${id}/cancel`, { method: "POST" }),
};
