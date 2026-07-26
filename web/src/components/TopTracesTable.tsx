import { Link } from "react-router-dom";
import { TopTraceItem } from "../api/dashboard";
import { formatCost, formatDuration } from "../lib/format";

type TopTracesTableProps = {
  traces: TopTraceItem[];
  orderBy: string;
};

export default function TopTracesTable({ traces, orderBy }: TopTracesTableProps) {
  const rankLabel = orderBy === "cost" ? "Cost" : orderBy === "latency" ? "Latency" : "Tokens";

  if (!traces.length) {
    return (
      <div className="p-6 text-center text-neutral-400 text-sm">
        No traces in this time range
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-3 py-2">#</th>
            <th className="text-left px-3 py-2">Name</th>
            <th className="text-left px-3 py-2">Time</th>
            <th className="text-right px-3 py-2">Cost</th>
            <th className="text-right px-3 py-2">Latency</th>
            <th className="text-right px-3 py-2">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {traces.map((t, i) => (
            <tr key={t.id} className="border-t border-neutral-100 hover:bg-neutral-50">
              <td className="px-3 py-2 text-neutral-400 tabular-nums">{i + 1}</td>
              <td className="px-3 py-2">
                <Link
                  to={`/traces/${t.id}`}
                  className="text-blue-600 hover:underline font-mono text-xs"
                >
                  {t.name || t.id.substring(0, 16)}
                </Link>
              </td>
              <td className="px-3 py-2 text-neutral-500 text-xs">
                {new Date(t.timestamp).toLocaleString()}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatCost(t.cost_usd)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatDuration(t.latency_ms)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{t.tokens.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
