import { ModelStats } from "../api/dashboard";

type ModelComparisonProps = {
  models: ModelStats[];
};

export default function ModelComparison({ models }: ModelComparisonProps) {
  if (!models.length) {
    return (
      <div className="h-64 flex items-center justify-center text-neutral-400 text-sm">
        No model data
      </div>
    );
  }

  return (
    <div className="overflow-auto max-h-64">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase tracking-wide sticky top-0">
          <tr>
            <th className="text-left px-3 py-2">Model</th>
            <th className="text-right px-3 py-2">Calls</th>
            <th className="text-right px-3 py-2">Tokens</th>
            <th className="text-right px-3 py-2">Cost</th>
            <th className="text-right px-3 py-2">Avg Latency</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model} className="border-t border-neutral-100 hover:bg-neutral-50">
              <td className="px-3 py-2 font-mono text-xs">{m.model}</td>
              <td className="px-3 py-2 text-right tabular-nums">{m.total_observations.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">{m.total_tokens.toLocaleString()}</td>
              <td className="px-3 py-2 text-right tabular-nums">${m.total_cost_usd.toFixed(4)}</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {m.avg_latency_ms ? `${Math.round(m.avg_latency_ms)}ms` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
