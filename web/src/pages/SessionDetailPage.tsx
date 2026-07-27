import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { ReactNode } from "react";
import { api, Trace } from "../api/client";
import { formatCost, formatDuration, formatNum, formatTime } from "../lib/format";

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const decoded = id ? decodeURIComponent(id) : "";
  const q = useQuery({
    queryKey: ["session", decoded],
    queryFn: () => api.getSession(decoded),
    enabled: !!decoded,
  });

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="mb-4 text-sm text-neutral-500">
        <Link to="/sessions" className="hover:underline">
          ← Back to sessions
        </Link>
      </div>

      {q.isLoading && <div>Loading…</div>}
      {q.isError && (
        <div className="text-red-600 text-sm">
          Error: {String((q.error as Error).message)}
        </div>
      )}

      {q.data && (
        <>
          <div className="bg-white border border-neutral-200 rounded-md p-4 mb-6">
            <div className="flex items-baseline gap-3">
              <h1 className="text-lg font-semibold font-mono">{q.data.session_id}</h1>
              <span className="text-xs text-neutral-400">session</span>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
              <Metric label="User" value={q.data.user_id ?? "—"} />
              <Metric label="Traces" value={q.data.trace_count} />
              <Metric label="First" value={formatTime(q.data.first_trace_at)} />
              <Metric label="Last" value={formatTime(q.data.last_trace_at)} />
              <Metric label="Cost" value={formatCost(q.data.total_cost_usd)} />
            </div>
          </div>

          <div className="relative pl-6">
            {/* vertical timeline rail */}
            <div className="absolute left-2 top-2 bottom-2 w-px bg-neutral-200" />
            <div className="space-y-3">
              {q.data.traces.map((t) => (
                <TraceCard key={t.id} t={t} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function TraceCard({ t }: { t: Trace }) {
  return (
    <div className="relative bg-white border border-neutral-200 rounded-md p-3">
      <div className="absolute -left-[19px] top-4 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
      <div className="flex items-baseline gap-3">
        <Link
          to={`/traces/${t.id}`}
          className="font-mono font-semibold text-blue-600 hover:underline"
        >
          {t.name ?? "(unnamed trace)"}
        </Link>
        <span className="text-xs text-neutral-400 font-mono">{t.id}</span>
        <span className="text-xs text-neutral-500 ml-auto">
          {formatTime(t.timestamp)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-3 text-xs">
        <Metric label="Duration" value={formatDuration(t.duration_ms)} />
        <Metric label="Obs" value={t.observation_count} />
        <Metric label="Tokens" value={formatNum(t.total_tokens)} />
        <Metric label="Cost" value={formatCost(t.total_cost_usd)} />
      </div>
      {(t.input != null || t.output != null) && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {t.input != null && (
            <Bubble kind="input" value={t.input} />
          )}
          {t.output != null && (
            <Bubble kind="output" value={t.output} />
          )}
        </div>
      )}
    </div>
  );
}

function Bubble({ kind, value }: { kind: "input" | "output"; value: unknown }) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const truncated = text.length > 400 ? text.slice(0, 400) + "…" : text;
  return (
    <div
      className={`rounded p-2 border ${
        kind === "input"
          ? "bg-neutral-50 border-neutral-200"
          : "bg-blue-50 border-blue-200"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {kind}
      </div>
      <pre className="font-mono whitespace-pre-wrap break-words">{truncated}</pre>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
