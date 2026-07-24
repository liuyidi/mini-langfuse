import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, SessionSummary } from "../api/client";
import { formatCost, formatNum, formatTime } from "../lib/format";

export default function SessionListPage() {
  const q = useQuery({ queryKey: ["sessions"], queryFn: () => api.listSessions() });

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-xl font-semibold">Sessions</h1>
        <div className="text-sm text-neutral-500">
          {q.data ? `${q.data.total} total` : ""}
        </div>
      </div>

      {q.isLoading && <div className="text-neutral-500">Loading…</div>}
      {q.isError && (
        <div className="text-red-600 text-sm">
          Error: {String((q.error as Error).message)}
        </div>
      )}

      {q.data && (
        <div className="bg-white rounded-md border border-neutral-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-neutral-100 text-neutral-600 uppercase tracking-wide text-[11px]">
              <tr>
                <th className="text-left px-4 py-2">Session</th>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-right px-4 py-2">Traces</th>
                <th className="text-left px-4 py-2">First</th>
                <th className="text-left px-4 py-2">Last</th>
                <th className="text-right px-4 py-2">Tokens</th>
                <th className="text-right px-4 py-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              {q.data.data.map((s: SessionSummary) => (
                <tr key={s.session_id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-2 font-mono">
                    <Link
                      to={`/sessions/${encodeURIComponent(s.session_id)}`}
                      className="text-blue-600 hover:underline"
                    >
                      {s.session_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{s.user_id ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.trace_count}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatTime(s.first_trace_at)}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatTime(s.last_trace_at)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatNum(s.total_tokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatCost(s.total_cost_usd)}</td>
                </tr>
              ))}
              {q.data.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-neutral-400">
                    No sessions yet. Sessions appear when a trace has a session_id.
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
