import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, Observation } from "../api/client";
import TraceTree from "../components/TraceTree";
import JsonViewer from "../components/JsonViewer";
import { formatCost, formatDuration, formatNum, formatTime } from "../lib/format";

function flatten(nodes: Observation[]): Observation[] {
  const out: Observation[] = [];
  const walk = (ns: Observation[]) => {
    for (const n of ns) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export default function TraceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({
    queryKey: ["trace", id],
    queryFn: () => api.getTrace(id!),
    enabled: !!id,
  });

  const flat = useMemo(() => (q.data ? flatten(q.data.observations) : []), [q.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = flat.find((o) => o.id === selectedId) ?? null;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4 text-sm text-neutral-500">
        <Link to="/" className="hover:underline">
          ← Back to traces
        </Link>
      </div>

      {q.isLoading && <div>Loading…</div>}
      {q.isError && (
        <div className="text-red-600 text-sm">Error: {String((q.error as Error).message)}</div>
      )}

      {q.data && (
        <>
          {/* Trace header */}
          <div className="bg-white border border-neutral-200 rounded-md p-4 mb-4">
            <div className="flex items-baseline gap-3">
              <h1 className="text-lg font-semibold font-mono">
                {q.data.name ?? "(unnamed trace)"}
              </h1>
              <span className="text-xs text-neutral-400 font-mono">{q.data.id}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-6 gap-3 text-sm">
              <Metric label="Time" value={formatTime(q.data.timestamp)} />
              <Metric label="User" value={q.data.user_id ?? "—"} />
              <Metric label="Session" value={q.data.session_id ?? "—"} />
              <Metric label="Duration" value={formatDuration(q.data.duration_ms)} />
              <Metric label="Tokens" value={formatNum(q.data.total_tokens)} />
              <Metric label="Cost" value={formatCost(q.data.total_cost_usd)} />
            </div>
          </div>

          {/* Two-pane layout */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
            <div className="bg-white border border-neutral-200 rounded-md p-3">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 px-2 pb-2">
                Observation Tree ({q.data.observation_count})
              </div>
              {q.data.observations.length === 0 ? (
                <div className="text-sm text-neutral-400 px-2 py-6">
                  This trace has no observations.
                </div>
              ) : (
                <TraceTree
                  nodes={q.data.observations}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              )}
            </div>

            <div className="bg-white border border-neutral-200 rounded-md p-4">
              {selected ? (
                <ObservationDetail obs={selected} />
              ) : (
                <TraceIO input={q.data.input} output={q.data.output} metadata={q.data.metadata} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="text-sm font-mono">{value}</div>
    </div>
  );
}

function TraceIO({ input, output, metadata }: { input: unknown; output: unknown; metadata: unknown }) {
  return (
    <div className="space-y-4">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">
        Trace Input / Output
      </div>
      <Section title="Input"><JsonViewer value={input} /></Section>
      <Section title="Output"><JsonViewer value={output} /></Section>
      <Section title="Metadata"><JsonViewer value={metadata} /></Section>
    </div>
  );
}

function ObservationDetail({ obs }: { obs: Observation }) {
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wider text-neutral-500">
          {obs.type}
        </span>
        <span className="font-mono font-semibold">{obs.name ?? "(unnamed)"}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Metric
          label="Duration"
          value={
            obs.end_time
              ? formatDuration(new Date(obs.end_time).getTime() - new Date(obs.start_time).getTime())
              : "running"
          }
        />
        <Metric label="Status" value={obs.status ?? "—"} />
        {obs.type === "GENERATION" && (
          <>
            <Metric label="Model" value={obs.model ?? "—"} />
            <Metric
              label="Tokens (p/c/t)"
              value={`${obs.prompt_tokens ?? "—"} / ${obs.completion_tokens ?? "—"} / ${obs.total_tokens ?? "—"}`}
            />
          </>
        )}
      </div>
      {obs.status_message && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {obs.status_message}
        </div>
      )}
      <Section title="Input"><JsonViewer value={obs.input} /></Section>
      <Section title="Output"><JsonViewer value={obs.output} /></Section>
      <Section title="Metadata"><JsonViewer value={obs.metadata} /></Section>
      {obs.type === "GENERATION" && (
        <Section title="Model parameters">
          <JsonViewer value={obs.model_parameters} />
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {title}
      </div>
      {children}
    </div>
  );
}
