// Dashboard API client (M11)
import { api } from "./client";

const DEMO_PK = "pk-lf-demo";
const DEMO_SK = "sk-lf-demo";
const authHeader = "Basic " + btoa(`${DEMO_PK}:${DEMO_SK}`);

async function dashReq<T>(path: string): Promise<T> {
  const r = await fetch(path, {
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

export type PeriodRange = { from_ts: string; to_ts: string };

export type SummaryResponse = {
  period: PeriodRange;
  total_traces: number;
  total_observations: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  p99_latency_ms: number | null;
};

export type TimeseriesBucket = {
  timestamp: string;
  value: number;
  count: number;
};

export type TimeseriesResponse = {
  granularity: string;
  metric: string;
  buckets: TimeseriesBucket[];
};

export type ModelStats = {
  model: string;
  total_observations: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_latency_ms: number | null;
  avg_prompt_tokens: number | null;
  avg_completion_tokens: number | null;
};

export type ModelsResponse = {
  period: PeriodRange;
  models: ModelStats[];
};

export type HistogramBucket = {
  bucket: string;
  count: number;
};

export type LatencyDistributionResponse = {
  period: PeriodRange;
  histogram: HistogramBucket[];
};

export type TopTraceItem = {
  id: string;
  name: string | null;
  cost_usd: number;
  latency_ms: number | null;
  tokens: number;
  timestamp: string;
};

export type TopTracesResponse = {
  order_by: string;
  traces: TopTraceItem[];
};

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  return entries.length ? "?" + new URLSearchParams(entries as [string, string][]).toString() : "";
}

export const dashboardApi = {
  getSummary: (from?: string, to?: string) =>
    dashReq<SummaryResponse>(
      `/api/public/dashboard/summary${qs({ fromTimestamp: from, toTimestamp: to })}`
    ),

  getTimeseries: (
    metric: string = "cost",
    from?: string,
    to?: string,
    granularity?: string
  ) =>
    dashReq<TimeseriesResponse>(
      `/api/public/dashboard/timeseries${qs({
        metric,
        fromTimestamp: from,
        toTimestamp: to,
        granularity,
      })}`
    ),

  getModels: (from?: string, to?: string) =>
    dashReq<ModelsResponse>(
      `/api/public/dashboard/models${qs({ fromTimestamp: from, toTimestamp: to })}`
    ),

  getLatencyDistribution: (from?: string, to?: string) =>
    dashReq<LatencyDistributionResponse>(
      `/api/public/dashboard/latency-distribution${qs({ fromTimestamp: from, toTimestamp: to })}`
    ),

  getTopTraces: (orderBy: string = "cost", limit: number = 10, from?: string, to?: string) =>
    dashReq<TopTracesResponse>(
      `/api/public/dashboard/top-traces${qs({
        orderBy,
        limit: String(limit),
        fromTimestamp: from,
        toTimestamp: to,
      })}`
    ),
};
