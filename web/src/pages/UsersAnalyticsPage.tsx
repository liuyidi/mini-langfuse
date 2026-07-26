import { useState } from "react";
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
import { usersApi } from "../api/users";
import TimeRangePicker, { getTimeRangeTimestamps } from "../components/TimeRangePicker";
import KpiCard from "../components/KpiCard";

export default function UsersAnalyticsPage() {
  const [timeRange, setTimeRange] = useState("30d");
  const { from, to } = getTimeRangeTimestamps(timeRange);

  const q = useQuery({
    queryKey: ["users-analytics", timeRange],
    queryFn: () => usersApi.getAnalytics(from, to),
  });

  const data = q.data;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Users</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Track user behavior, activity trends, and engagement over time.
          </p>
        </div>
        <TimeRangePicker value={timeRange} onChange={setTimeRange} />
      </div>

      {q.isLoading && <div className="text-neutral-500">Loading...</div>}
      {q.isError && <div className="text-red-600 text-sm">Error loading users analytics</div>}

      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <KpiCard
              title="Total Users"
              value={data.summary.total_users.toLocaleString()}
            />
            <KpiCard
              title="Total Traces"
              value={data.summary.total_traces.toLocaleString()}
            />
            <KpiCard
              title="Total Sessions"
              value={data.summary.total_sessions.toLocaleString()}
            />
            <KpiCard
              title="Avg Traces/User"
              value={data.summary.avg_traces_per_user.toFixed(1)}
            />
          </div>

          {/* Activity Chart */}
          <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
            <h2 className="text-sm font-medium text-neutral-700 mb-3">Daily Activity</h2>
            {data.daily_activity.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
                No activity data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.daily_activity} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    tick={{ fontSize: 11, fill: "#737373" }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fill: "#737373" }}
                    width={40}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 11, fill: "#737373" }}
                    width={40}
                  />
                  <Tooltip
                    labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e5e5" }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="trace_count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="Traces"
                    dot={{ r: 2 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="active_users"
                    stroke="#22c55e"
                    strokeWidth={2}
                    name="Active Users"
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top Users */}
          <div className="bg-white rounded-lg border border-neutral-200 p-4">
            <h2 className="text-sm font-medium text-neutral-700 mb-3">
              Top Users
              <span className="text-neutral-400 font-normal ml-2">({data.top_users.length})</span>
            </h2>
            {data.top_users.length === 0 ? (
              <div className="p-6 text-center text-neutral-400 text-sm">No user data</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-neutral-600 text-[11px] uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-3 py-2 w-8">#</th>
                      <th className="text-left px-3 py-2">User ID</th>
                      <th className="text-right px-3 py-2">Traces</th>
                      <th className="text-right px-3 py-2">Sessions</th>
                      <th className="text-right px-3 py-2">Tokens</th>
                      <th className="text-right px-3 py-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_users.map((u, i) => (
                      <tr key={u.user_id} className="border-t border-neutral-100 hover:bg-neutral-50">
                        <td className="px-3 py-2 text-neutral-400 tabular-nums">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-xs">{u.user_id}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{u.trace_count.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{u.session_count.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{u.total_tokens.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right tabular-nums">${u.total_cost_usd.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
