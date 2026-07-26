import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { getTimeRangeTimestamps } from "../components/TimeRangePicker";
import TimeRangePicker from "../components/TimeRangePicker";
import KpiCard from "../components/KpiCard";
import TrendChart from "../components/TrendChart";
import LatencyHistogram from "../components/LatencyHistogram";
import ModelComparison from "../components/ModelComparison";
import TopTracesTable from "../components/TopTracesTable";

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState("24h");
  const [trendMetric, setTrendMetric] = useState("cost");
  const [topOrderBy, setTopOrderBy] = useState("cost");
  const { from, to } = getTimeRangeTimestamps(timeRange);

  // Fetch all dashboard data
  const summary = useQuery({
    queryKey: ["dashboard", "summary", timeRange],
    queryFn: () => dashboardApi.getSummary(from, to),
  });

  const timeseries = useQuery({
    queryKey: ["dashboard", "timeseries", timeRange, trendMetric],
    queryFn: () => dashboardApi.getTimeseries(trendMetric, from, to),
  });

  const models = useQuery({
    queryKey: ["dashboard", "models", timeRange],
    queryFn: () => dashboardApi.getModels(from, to),
  });

  const latency = useQuery({
    queryKey: ["dashboard", "latency", timeRange],
    queryFn: () => dashboardApi.getLatencyDistribution(from, to),
  });

  const topTraces = useQuery({
    queryKey: ["dashboard", "top", timeRange, topOrderBy],
    queryFn: () => dashboardApi.getTopTraces(topOrderBy, 10, from, to),
  });

  const s = summary.data;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <TimeRangePicker value={timeRange} onChange={setTimeRange} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <KpiCard
          title="Traces"
          value={s?.total_traces?.toLocaleString() ?? "—"}
          subtitle={`${s?.total_observations?.toLocaleString() ?? 0} observations`}
        />
        <KpiCard
          title="Total Cost"
          value={s ? `$${s.total_cost_usd.toFixed(4)}` : "—"}
          subtitle="all models"
        />
        <KpiCard
          title="Total Tokens"
          value={s?.total_tokens?.toLocaleString() ?? "—"}
        />
        <KpiCard
          title="Avg Latency"
          value={s?.avg_latency_ms ? `${Math.round(s.avg_latency_ms)}ms` : "—"}
          subtitle={s?.p50_latency_ms ? `P50: ${Math.round(s.p50_latency_ms)}ms` : undefined}
        />
        <KpiCard
          title="P95 Latency"
          value={s?.p95_latency_ms ? `${Math.round(s.p95_latency_ms)}ms` : "—"}
          subtitle={s?.p99_latency_ms ? `P99: ${Math.round(s.p99_latency_ms)}ms` : undefined}
        />
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-neutral-700">Trend</h2>
          <div className="flex items-center gap-1 bg-neutral-100 rounded-md p-0.5">
            {(["cost", "tokens", "traces", "latency"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setTrendMetric(m)}
                className={`px-2 py-0.5 text-xs rounded ${
                  trendMetric === m
                    ? "bg-white shadow-sm text-neutral-900 font-medium"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {timeseries.isLoading ? (
          <div className="h-64 flex items-center justify-center text-neutral-400">Loading...</div>
        ) : (
          <TrendChart data={timeseries.data?.buckets ?? []} metric={trendMetric} />
        )}
      </div>

      {/* Two-column: Latency Histogram + Model Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-700 mb-4">Latency Distribution</h2>
          {latency.isLoading ? (
            <div className="h-64 flex items-center justify-center text-neutral-400">Loading...</div>
          ) : (
            <LatencyHistogram data={latency.data?.histogram ?? []} />
          )}
        </div>
        <div className="bg-white rounded-lg border border-neutral-200 p-4">
          <h2 className="text-sm font-medium text-neutral-700 mb-4">Model Comparison</h2>
          {models.isLoading ? (
            <div className="h-64 flex items-center justify-center text-neutral-400">Loading...</div>
          ) : (
            <ModelComparison models={models.data?.models ?? []} />
          )}
        </div>
      </div>

      {/* Top Traces */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-neutral-700">Top Traces</h2>
          <div className="flex items-center gap-1 bg-neutral-100 rounded-md p-0.5">
            {(["cost", "latency", "tokens"] as const).map((o) => (
              <button
                key={o}
                onClick={() => setTopOrderBy(o)}
                className={`px-2 py-0.5 text-xs rounded ${
                  topOrderBy === o
                    ? "bg-white shadow-sm text-neutral-900 font-medium"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                by {o}
              </button>
            ))}
          </div>
        </div>
        {topTraces.isLoading ? (
          <div className="p-6 text-center text-neutral-400">Loading...</div>
        ) : (
          <TopTracesTable traces={topTraces.data?.traces ?? []} orderBy={topOrderBy} />
        )}
      </div>
    </div>
  );
}
