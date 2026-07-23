import { Observation } from "../api/client";
import { formatDuration } from "../lib/format";

type Props = {
  nodes: Observation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
};

const typeColor: Record<Observation["type"], string> = {
  SPAN: "bg-blue-100 text-blue-700",
  GENERATION: "bg-purple-100 text-purple-700",
  EVENT: "bg-neutral-200 text-neutral-700",
};

function duration(o: Observation): number | null {
  if (!o.end_time) return null;
  return (new Date(o.end_time).getTime() - new Date(o.start_time).getTime()) || 0;
}

export default function TraceTree({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
}: Props) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((n) => {
        const isSel = n.id === selectedId;
        const isErr = n.status === "ERROR";
        return (
          <li key={n.id}>
            <button
              onClick={() => onSelect(n.id)}
              className={`w-full text-left flex items-center gap-2 rounded px-2 py-1 text-sm
                ${isSel ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-neutral-100"}
              `}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              <span className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeColor[n.type]}`}>
                {n.type === "GENERATION" ? "GEN" : n.type[0]}
              </span>
              <span className={`truncate font-mono ${isErr ? "text-red-600" : ""}`}>
                {n.name ?? "(unnamed)"}
              </span>
              <span className="ml-auto text-[11px] text-neutral-500 tabular-nums">
                {formatDuration(duration(n))}
              </span>
            </button>
            {n.children.length > 0 && (
              <TraceTree
                nodes={n.children}
                selectedId={selectedId}
                onSelect={onSelect}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
