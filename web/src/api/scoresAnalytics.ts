// Scores Analytics API client (M16)

const DEMO_PK = "pk-lf-demo";
const DEMO_SK = "sk-lf-demo";
const authHeader = "Basic " + btoa(`${DEMO_PK}:${DEMO_SK}`);

async function scoreReq<T>(path: string): Promise<T> {
  const r = await fetch(path, {
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  return entries.length ? "?" + new URLSearchParams(entries as [string, string][]).toString() : "";
}

export type ScoreSummary = {
  name: string;
  data_type: string;
  source: string;
  count: number;
  avg_value: number | null;
  min_value: number | null;
  max_value: number | null;
};

export type TimeseriesPoint = {
  timestamp: string;
  name: string;
  count: number;
  avg_value: number | null;
};

export type DistributionBucket = {
  bucket: string;
  count: number;
};

export type CategoricalDistribution = {
  name: string;
  categories: { value: string; count: number }[];
};

export type ScoreAnalyticsResponse = {
  period: { from: string; to: string };
  granularity: string;
  total_scores: number;
  summary: ScoreSummary[];
  timeseries: TimeseriesPoint[];
  distribution: DistributionBucket[];
  distribution_by_name: { name: string; histogram: DistributionBucket[] }[];
  categorical_distribution: CategoricalDistribution[];
};

export const scoresAnalyticsApi = {
  getAnalytics: (
    from?: string,
    to?: string,
    granularity?: string,
    name?: string,
    source?: string,
  ) =>
    scoreReq<ScoreAnalyticsResponse>(
      `/api/public/scores/analytics${qs({
        fromTimestamp: from,
        toTimestamp: to,
        granularity,
        name,
        source,
      })}`
    ),
};
