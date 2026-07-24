import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, PromptSummary } from "../api/client";
import { formatTime } from "../lib/format";

export default function PromptListPage() {
  const q = useQuery({ queryKey: ["prompts"], queryFn: () => api.listPrompts() });

  return (
    <div className="p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-xl font-semibold">Prompts</h1>
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
                <th className="text-left px-4 py-2">Name</th>
                <th className="text-left px-4 py-2">Latest version</th>
                <th className="text-left px-4 py-2">Labels</th>
                <th className="text-left px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {q.data.data.map((p: PromptSummary) => (
                <tr key={p.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-2 font-mono">
                    <Link to={`/prompts/${encodeURIComponent(p.name)}`} className="text-blue-600 hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 tabular-nums">v{p.latest_version ?? "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1 flex-wrap">
                      {(p.latest_labels ?? []).map((lb) => (
                        <span key={lb} className="inline-flex items-center rounded bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 font-semibold">
                          {lb}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{formatTime(p.created_at)}</td>
                </tr>
              ))}
              {q.data.data.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-neutral-400">
                    No prompts yet. Create one via <code>client.create_prompt(...)</code>.
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
