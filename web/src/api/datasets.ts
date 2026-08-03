// Datasets API client (M19)
import { getProjectAuthHeader } from "../lib/projectAuth";

async function dsReq<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: {
      Authorization: getProjectAuthHeader(),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

export type Dataset = {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  item_count: number;
  created_at: string;
};

export type DatasetItem = {
  id: string;
  dataset_id: string;
  input: unknown;
  expected_output: unknown;
  metadata: unknown;
  created_at: string;
};

export type DatasetRun = {
  id: string;
  project_id: string;
  dataset_id: string;
  dataset_name?: string;
  name: string | null;
  description: string | null;
  status: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  avg_score: number | null;
  error_message: string | null;
  created_at: string;
};

export type DatasetRunItem = {
  id: string;
  run_id: string;
  item_id: string;
  output: unknown;
  score_value: number | null;
  score_reasoning: string | null;
  trace_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

export type DatasetRunDetail = DatasetRun & {
  items: DatasetRunItem[];
};

export const datasetsApi = {
  list: () => dsReq<Dataset[]>("/api/public/datasets"),
  get: (id: string) => dsReq<Dataset>(`/api/public/datasets/${id}`),
  create: (body: { name: string; description?: string }) =>
    dsReq<Dataset>("/api/public/datasets", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: { name?: string; description?: string }) =>
    dsReq<Dataset>(`/api/public/datasets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (id: string) =>
    dsReq<{ ok: boolean }>(`/api/public/datasets/${id}`, { method: "DELETE" }),

  listItems: (datasetId: string) =>
    dsReq<DatasetItem[]>(`/api/public/datasets/${datasetId}/items`),
  createItem: (datasetId: string, body: { input?: unknown; expected_output?: unknown; metadata?: unknown }) =>
    dsReq<DatasetItem>(`/api/public/datasets/${datasetId}/items`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteItem: (datasetId: string, itemId: string) =>
    dsReq<{ ok: boolean }>(`/api/public/datasets/${datasetId}/items/${itemId}`, { method: "DELETE" }),

  listRuns: (datasetId: string) =>
    dsReq<DatasetRun[]>(`/api/public/datasets/${datasetId}/runs`),
  createRun: (datasetId: string, body: { name?: string; evaluator_id?: string }) =>
    dsReq<DatasetRun>(`/api/public/datasets/${datasetId}/runs`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  getRun: (runId: string) => dsReq<DatasetRunDetail>(`/api/public/dataset-runs/${runId}`),
};
