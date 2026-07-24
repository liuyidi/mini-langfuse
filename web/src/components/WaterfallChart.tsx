import { useMemo } from "react";
import { Observation } from "../api/client";
import { formatCost, formatDuration } from "../lib/format";

type Props = {
  /** Flat list, deep-first — same order as TraceTree renders */
  nodes: Observation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover?: (id: string | null) => void;
  hoveredId?: string | null;
};

const typeColors: Record<
  Observation["type"],
  { bar: string; barHover: string }
> = {
  SPAN: { bar: "bg-blue-400", barHover: "hover:bg-blue-500" },
  GENERATION: { bar: "bg-purple-400", barHover: "hover:bg-purple-500" },
  EVENT: { bar: "bg-neutral-400", barHover: "hover:bg-neutral-500" },
};

const ROW_H = 24;

export default function WaterfallChart({
  nodes,
  selectedId,
  onSelect,
  onHover,
  hoveredId,
}: Props) {
  const { traceStart, traceEnd, totalMs } = useMemo(() => {
    if (nodes.length === 0) {
      return { traceStart: 0, traceEnd: 0, totalMs: 1 };
    }
    let start = Infinity;
    let end = -Infinity;
    const now = Date.now();
    for (const n of nodes) {
      const s = new Date(n.start_time).getTime();
      const e = n.end_time ? new Date(n.end_time).getTime() : now;
      if (s < start) start = s;
      if (e > end) end = e;
    }
    return { traceStart: start, traceEnd: end, totalMs: Math.max(end - start, 1) };
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="text-sm text-neutral-400 px-2 py-6">
        No observations to chart.
      </div>
    );
  }

  // Axis ticks — 0 / 25% / 50% / 75% / 100%
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    pct,
    label: formatDuration(pct * totalMs),
  }));

  return (
    <div className="text-xs font-mono select-none">
      {/* Axis */}
      <div className="relative h-6 border-b border-neutral-200 mb-1">
        {ticks.map((t) => (
          <div
            key={t.pct}
            className="absolute top-0 h-full flex items-end"
            style={{
              left: `${t.pct * 100}%`,
              transform: t.pct === 1 ? "translateX(-100%)" : t.pct === 0 ? "" : "translateX(-50%)",
            }}
          >
            <span className="text-[10px] text-neutral-500 pb-0.5">
              {t.label}
            </span>
          </div>
        ))}
        {ticks.map((t) => (
          <div
            key={`g-${t.pct}`}
            className="absolute top-0 bottom-0 w-px bg-neutral-200"
            style={{ left: `${t.pct * 100}%` }}
          />
        ))}
      </div>

      {/* Rows */}
      <div className="relative">
        {nodes.map((n, i) => {
          const start = new Date(n.start_time).getTime();
          const running = !n.end_time;
          const end = n.end_time ? new Date(n.end_time).getTime() : traceEnd;
          const leftPct = ((start - traceStart) / totalMs) * 100;
          const widthPct = Math.max(((end - start) / totalMs) * 100, 0.5);
          const durationMs = end - start;
          const isSel = n.id === selectedId;
          const isHover = n.id === hoveredId;
          const isErr = n.status === "ERROR";
          const colors = typeColors[n.type];

          return (
            <div
              key={n.id}
              className={`relative ${
                isSel ? "bg-blue-50" : isHover ? "bg-neutral-50" : ""
              }`}
              style={{ height: ROW_H }}
              onMouseEnter={() => onHover?.(n.id)}
              onMouseLeave={() => onHover?.(null)}
            >
              {/* Row baseline grid ticks (light) */}
              {ticks.slice(1).map((t) => (
                <div
                  key={`row-${i}-${t.pct}`}
                  className="absolute top-0 bottom-0 w-px bg-neutral-100"
                  style={{ left: `${t.pct * 100}%` }}
                />
              ))}

              {/* The bar */}
              <button
                onClick={() => onSelect(n.id)}
                title={`${n.name ?? "(unnamed)"}
type: ${n.type}
start: +${formatDuration(start - traceStart)}
duration: ${running ? "running…" : formatDuration(durationMs)}${
                  n.type === "GENERATION" && n.total_cost_usd != null
                    ? `\ncost: ${formatCost(n.total_cost_usd)}`
                    : ""
                }`}
                className={`absolute top-1 bottom-1 rounded-sm ${colors.bar} ${colors.barHover}
                  ${isErr ? "ring-1 ring-red-500" : ""}
                  ${isSel ? "ring-2 ring-blue-600" : ""}
                  ${running ? "border border-dashed border-white" : ""}
                  cursor-pointer transition-colors overflow-hidden text-left px-1`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              >
                <span className="text-[10px] text-white/90 whitespace-nowrap">
                  {formatDuration(durationMs)}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex gap-3 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-blue-400" /> Span
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-purple-400" />{" "}
          Generation
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-neutral-400" /> Event
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm ring-1 ring-red-500" /> Error
        </span>
      </div>
    </div>
  );
}
