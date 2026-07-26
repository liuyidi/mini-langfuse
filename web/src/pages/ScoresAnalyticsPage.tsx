import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { scoresAnalyticsApi, ScoreAnalyticsResponse } from "../api/scoresAnalytics";
import TimeRangePicker, { getTimeRangeTimestamps } from "../components/TimeRangePicker";
import KpiCard from "../components/KpiCard";

// Color palette for different score names
const COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export default function ScoresAnalyticsPage() {
  const [timeRange, setTimeRange] = useState("30d");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const { from, to } = getTimeRangeTimestamps(timeRange);

  const q = useQuery({
    queryKey: ["scores-analytics", timeRange, sourceFilter],
    queryFn: () => scoresAnalyticsApi.getAnalytics(from, to, undefined, undefined, sourceFilter || undefined),
  });

  const data = q.data;

  // Get unique score names for chart legend
  const scoreNames = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.summary.map((s) => s.name))];
  }, [data]);

  // Prepare timeseries data grouped by date for multi-line chart
  const tsData = useMemo(() => {
    if (!data?.timeseries) return [];
    const byDate: Record<string, Record<string, number>> = {};
    for (const point of data.timeseries) {
      const date = new Date(point.timestamp).toLocaleDateString();
      if (!byDate[date]) byDate[date] = {};
      byDate[date][point.name] = point.avg_value ?? 0;
    }
    return Object.entries(byDate)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Total counts by source
  const sourceCounts = useMemo(() => {
    if (!data?.summary) return [];
    const counts: Record<string, number> = {};
    for (const s of data.summary) {
      counts[s.source] = (counts[s.source] || 0) + s.count;
    }
    return Object.entries(counts).map(([source, count]) => ({ source, count }));
  }, [data]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Scores Analytics</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Monitor evaluation scores over time across all dimensions.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="text-sm border border-neutral-200 rounded-md px-2 py-1.5"
          >
            <option value="">All Sources</option>
            <option value="HUMAN">Human</option>
            <option value="EVAL">LLM Judge</option>
            <option value="API">API</option>
          </select>
          <TimeRangePicker value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {q.isLoading && <div className="text-neutral-500">Loading...</div>}
      {q.isError && <div className="text-red-600 text-sm">Error loading analytics</div>}

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard
              title="Total Scores"
              value={data.total_scores.toLocaleString()}
              subtitle={`${data.summary.length} score types`}
            />
            <KpiCard
              title="Human Scores"
              value={sourceCounts.find((s) => s.source === "HUMAN")?.count?.toLocaleString() ?? "0"}
              subtitle="manual annotations"
            />
            <KpiCard
              title="LLM Judge"
              value={sourceCounts.find((s) => s.source === "EVAL")?.count?.toLocaleString() ?? "0"}
              subtitle="auto evaluations"
            />
            <KpiCard
              title="Avg Score"
              value={
                data.summary.length > 0
                  ? (data.summary.reduce((acc, s) => acc + (s.avg_value ?? 0) * s.count, 0) /
                    Math.max(1, data.total_scores))
                    .toFixed(2)
                  : "—"
              }
            />
          </div>

          {/* Summary Table */}
          <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
            <h2 className="text-sm font-medium text-neutral-700 mb-3">Score Summary</h2>
            {data.summary.length === 0 ? (
              <div className="text-neutral-400 text-sm text-center py-6">
                No scores recorded yet. Start by annotating traces or running LLM evaluators.
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-neutral-600 text-[11px] uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Type</th>
                      <th className="text-left px-3 py-2">Source</th>
                      <th className="text-right px-3 py-2">Count</th>
                      <th className="text-right px-3 py-2">Avg</th>
                      <th className="text-right px-3 py-2">Min</th>
                      <th className="text-right px-3 py-2">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.summary.map((s, i) => (
                      <tr key={`${s.name}-${s.source}`} className="border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="px-3 py-2 font-medium">{s.name}</td>
                        <td className="px-3 py-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                            {s.data_type}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            s.source === "HUMAN" ? "bg-blue-50 text-blue-700" :
                            s.source === "EVAL" ? "bg-purple-50 text-purple-700" :
                            "bg-neutral-100 text-neutral-600"
                          }`}>
                            {s.source}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.count.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {s.avg_value !== null ? s.avg_value.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                          {s.min_value !== null ? s.min_value.toFixed(2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                          {s.max_value !== null ? s.max_value.toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Time Series Chart */}
          <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
            <h2 className="text-sm font-medium text-neutral-700 mb-3">Score Trend</h2>
            {tsData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
                No time series data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={tsData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#737373" }}
                    axisLine={{ stroke: "#d4d4d4" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#737373" }}
                    axisLine={{ stroke: "#d4d4d4" }}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e5e5" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {scoreNames.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Numeric Distribution */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h2 className="text-sm font-medium text-neutral-700 mb-3">Score Distribution</h2>
              {data.distribution.every((d) => d.count === 0) ? (
                <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
                  No numeric scores
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.distribution} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                    <XAxis
                      dataKey="bucket"
                      tick={{ fontSize: 11, fill: "#737373" }}
                      axisLine={{ stroke: "#d4d4d4" }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#737373" }}
                      axisLine={{ stroke: "#d4d4d4" }}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e5e5" }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Per-name distribution */}
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <h2 className="text-sm font-medium text-neutral-700 mb-3">By Score Name</h2>
              {data.distribution_by_name.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
                  No per-name data
                </div>
              ) : (
                <div className="space-y-4 overflow-auto max-h-64">
                  {data.distribution_by_name.map((item, i) => {
                    const total = item.histogram.reduce((a, b) => a + b.count, 0);
                    return (
                      <div key={item.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium" style={{ color: COLORS[i % COLORS.length] }}>
                            {item.name}
                          </span>
                          <span className="text-xs text-neutral-500">{total} scores</span>
                        </div>
                        <div className="flex h-4 rounded overflow-hidden">
                          {item.histogram.map((h) => {
                            const pct = total > 0 ? (h.count / total) * 100 : 0;
                            const colors: Record<string, string> = {
                              "1-2": "#ef4444",
                              "2-3": "#f59e0b",
                              "3-4": "#84cc16",
                              "4-5": "#22c55e",
                            };
                            return (
                              <div
                                key={h.bucket}
                                style={{ width: `${pct}%`, backgroundColor: colors[h.bucket] || "#999" }}
                                title={`${h.bucket}: ${h.count}`}
                              />
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[10px] text-neutral-400 mt-0.5">
                          {item.histogram.map((h) => (
                            <span key={h.bucket}>{h.bucket}: {h.count}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Categorical Distribution */}
          {data.categorical_distribution.length > 0 && (
            <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
              <h2 className="text-sm font-medium text-neutral-700 mb-3">Categorical Scores</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.categorical_distribution.map((item) => (
                  <div key={item.name}>
                    <div className="text-sm font-medium mb-2">{item.name}</div>
                    <div className="space-y-1">
                      {item.categories
                        .sort((a, b) => b.count - a.count)
                        .map((cat) => {
                          const total = item.categories.reduce((a, b) => a + b.count, 0);
                          const pct = total > 0 ? (cat.count / total) * 100 : 0;
                          return (
                            <div key={cat.value} className="flex items-center gap-2">
                              <span className="text-xs w-20 truncate">{cat.value}</span>
                              <div className="flex-1 h-4 bg-neutral-100 rounded overflow-hidden">
                                <div
                                  className="h-full bg-purple-400 rounded"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-neutral-500 w-12 text-right">
                                {cat.count} ({pct.toFixed(0)}%)
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
