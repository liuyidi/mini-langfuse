import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, Trace } from "../api/client";
import { useAuth } from "../lib/auth";
import { formatCost, formatDuration, formatNum, formatTime } from "../lib/format";
import { useSSE } from "../lib/useSSE";

export default function TraceListPage() {
  const queryClient = useQueryClient();
  const { currentProject } = useAuth();
  const [newCount, setNewCount] = useState(0);

  const q = useQuery({ queryKey: ["traces"], queryFn: () => api.listTraces() });

  // Handle new trace events from SSE
  const handleTraceUpserted = useCallback(() => {
    setNewCount((c) => c + 1);
  }, []);

  // Connect to SSE for real-time updates (cookie session + project_id query)
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
        </div>
        <div className="text-sm text-neutral-500">
          {q.data ? `${q.data.total} total` : ""}
        </div>
      </div>

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
                    No traces yet. Run <code className="font-mono text-neutral-600">python demo.py</code> from the repo root.
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
