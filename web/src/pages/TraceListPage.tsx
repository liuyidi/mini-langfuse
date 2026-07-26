import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, Trace } from "../api/client";
import { useAuth } from "../lib/auth";
import { formatCost, formatDuration, formatNum, formatTime } from "../lib/format";
import { useSSE } from "../lib/useSSE";
import { useTraceFilters } from "../hooks/useTraceFilters";
import TraceFilter from "../components/TraceFilter";

export default function TraceListPage() {
  const queryClient = useQueryClient();
  const { currentProject } = useAuth();
  const [newCount, setNewCount] = useState(0);
  const { filters, setFilters, clearFilters, toApiParams, hasActiveFilters } = useTraceFilters();

  const apiParams = toApiParams();

  const q = useQuery({
    queryKey: ["traces", apiParams],
    queryFn: () => api.listTraces(apiParams),
  });

  // Handle new trace events from SSE
  const handleTraceUpserted = useCallback(() => {
    setNewCount((c) => c + 1);
  }, []);

  // Connect to SSE for real-time updates
  useSSE({
    projectId: currentProject?.id,
    enabled: Boolean(currentProject?.id),
    onTraceUpserted: handleTraceUpserted,
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["traces"] });
    setNewCount(0);
  };

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Traces</h1>
          {newCount > 0 && (
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-0.5 text-xs font-medium hover:bg-blue-100 transition-colors"
            >
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              {newCount} new trace{newCount > 1 ? "s" : ""}
            </button>
          )}
          {hasActiveFilters && (
            <span className="text-xs text-neutral-400">
              {q.data?.total ?? 0} matching
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            {!hasActiveFilters && q.data ? `${q.data.total} total` : ""}
          </span>
          {/* Export dropdown */}
          <div className="relative group">
            <button className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 border border-neutral-200 rounded px-2.5 py-1 hover:bg-neutral-50">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-3.5 h-3.5">
                <path d="M8 2v8M4 7l4 4 4-4M2 12v2h12v-2" />
              </svg>
              Export
            </button>
            <div className="absolute right-0 mt-1 w-32 bg-white border border-neutral-200 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button
                onClick={() => {
                  const params = new URLSearchParams(toApiParams());
                  params.set("format", "json");
                  params.set("limit", "1000");
                  window.open(`/api/public/traces/export?${params.toString()}`, "_blank");
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-50"
              >
                Export as JSON
              </button>
              <button
                onClick={() => {
                  const params = new URLSearchParams(toApiParams());
                  params.set("format", "csv");
                  params.set("limit", "1000");
                  window.open(`/api/public/traces/export?${params.toString()}`, "_blank");
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-neutral-50"
              >
                Export as CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <TraceFilter
        filters={filters}
        onChange={setFilters}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {q.isLoading && <div className="text-neutral-500">Loading…</div>}
      {q.isError && (
        <div className="text-red-600 text-sm">Error: {String((q.error as Error).message)}</div>
      )}

      {q.data && (
        <div className="bg-white rounded-md border border-neutral-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-600 uppercase tracking-wide text-[11px]">
              <tr>
                <th className="text-left px-4 py-2">Time</th>
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Session</th>
                <th className="text-right px-4 py-2">Duration</th>
                <th className="text-right px-4 py-2">Tokens</th>
                <th className="text-right px-4 py-2">Cost</th>
                <th className="text-right px-4 py-2">Obs</th>
              </tr>
            </thead>
            <tbody>
              {q.data.data.map((t: Trace) => (
                <tr
                  key={t.id}
                  className="border-t border-neutral-100 hover:bg-neutral-50"
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    <Link
                      to={`/traces/${t.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {formatTime(t.timestamp)}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-mono">{t.name ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{t.user_id ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-600">{t.session_id ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatDuration(t.duration_ms)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatNum(t.total_tokens)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {formatCost(t.total_cost_usd)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {t.observation_count}
                  </td>
                </tr>
              ))}
              {q.data.data.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-neutral-400"
                  >
                    {hasActiveFilters
                      ? "No traces match your filters."
                      : "No traces yet. Run python demo.py from the repo root."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
