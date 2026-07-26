// Trace filter bar component (M18)
import { useQuery } from "@tanstack/react-query";
import { TraceFilters } from "../hooks/useTraceFilters";

const DEMO_PK = "pk-lf-demo";
const DEMO_SK = "sk-lf-demo";
const authHeader = "Basic " + btoa(`${DEMO_PK}:${DEMO_SK}`);

type Props = {
  filters: TraceFilters;
  onChange: (partial: Partial<TraceFilters>) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
};

async function fetchFacets() {
  const r = await fetch("/api/public/traces/facets", {
    headers: { Authorization: authHeader },
  });
  if (!r.ok) throw new Error("Failed to fetch facets");
  return r.json();
}

export default function TraceFilter({ filters, onChange, onClear, hasActiveFilters }: Props) {
  const facets = useQuery({
    queryKey: ["trace-facets"],
    queryFn: fetchFacets,
    staleTime: 30000,
  });

  const facetNames = facets.data?.names || [];
  const facetUsers = facets.data?.users || [];
  const facetTags = facets.data?.tags || [];
  const facetModels = facets.data?.models || [];

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3 mb-4">
      {/* Search row */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm">🔍</span>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder="Search traces (name, input, output)..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-neutral-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="text-xs text-neutral-500 hover:text-neutral-700 px-2 py-1.5 whitespace-nowrap"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Name */}
        <select
          value={filters.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
        >
          <option value="">All names</option>
          {facetNames.map((n: { value: string; count: number }) => (
            <option key={n.value} value={n.value}>{n.value} ({n.count})</option>
          ))}
        </select>

        {/* Tags */}
        <select
          value={filters.tags.join(",")}
          onChange={(e) => onChange({ tags: e.target.value ? e.target.value.split(",") : [] })}
          className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
        >
          <option value="">All tags</option>
          {facetTags.map((t: { value: string; count: number }) => (
            <option key={t.value} value={t.value}>{t.value} ({t.count})</option>
          ))}
        </select>

        {/* User */}
        <select
          value={filters.userId}
          onChange={(e) => onChange({ userId: e.target.value })}
          className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
        >
          <option value="">All users</option>
          {facetUsers.map((u: { value: string; count: number }) => (
            <option key={u.value} value={u.value}>{u.value} ({u.count})</option>
          ))}
        </select>

        {/* Model */}
        <select
          value={filters.model}
          onChange={(e) => onChange({ model: e.target.value })}
          className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
        >
          <option value="">All models</option>
          {facetModels.map((m: { value: string; count: number }) => (
            <option key={m.value} value={m.value}>{m.value} ({m.count})</option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => onChange({ status: e.target.value })}
          className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
        >
          <option value="">All status</option>
          <option value="OK">OK</option>
          <option value="ERROR">Error</option>
        </select>

        {/* Separator */}
        <div className="w-px h-5 bg-neutral-200" />

        {/* Cost range */}
        <span className="text-xs text-neutral-500">Cost:</span>
        <input
          type="number"
          value={filters.minCost}
          onChange={(e) => onChange({ minCost: e.target.value })}
          placeholder="min"
          step="0.001"
          className="w-16 text-xs border border-neutral-200 rounded px-1.5 py-1"
        />
        <span className="text-xs text-neutral-400">–</span>
        <input
          type="number"
          value={filters.maxCost}
          onChange={(e) => onChange({ maxCost: e.target.value })}
          placeholder="max"
          step="0.001"
          className="w-16 text-xs border border-neutral-200 rounded px-1.5 py-1"
        />

        {/* Latency range */}
        <span className="text-xs text-neutral-500">Latency:</span>
        <input
          type="number"
          value={filters.minLatency}
          onChange={(e) => onChange({ minLatency: e.target.value })}
          placeholder="min"
          className="w-16 text-xs border border-neutral-200 rounded px-1.5 py-1"
        />
        <span className="text-xs text-neutral-400">–</span>
        <input
          type="number"
          value={filters.maxLatency}
          onChange={(e) => onChange({ maxLatency: e.target.value })}
          placeholder="max"
          className="w-16 text-xs border border-neutral-200 rounded px-1.5 py-1"
        />
        <span className="text-xs text-neutral-400">ms</span>

        {/* Separator */}
        <div className="w-px h-5 bg-neutral-200" />

        {/* Sort */}
        <span className="text-xs text-neutral-500">Sort:</span>
        <select
          value={filters.orderBy}
          onChange={(e) => onChange({ orderBy: e.target.value })}
          className="text-xs border border-neutral-200 rounded px-2 py-1 bg-white"
        >
          <option value="timestamp">Time</option>
          <option value="cost">Cost</option>
          <option value="latency">Latency</option>
          <option value="tokens">Tokens</option>
        </select>
        <button
          onClick={() => onChange({ orderDirection: filters.orderDirection === "desc" ? "asc" : "desc" })}
          className="text-xs border border-neutral-200 rounded px-1.5 py-1 bg-white hover:bg-neutral-50"
          title={filters.orderDirection === "desc" ? "Descending" : "Ascending"}
        >
          {filters.orderDirection === "desc" ? "↓" : "↑"}
        </button>
      </div>
    </div>
  );
}
