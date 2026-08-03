import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { datasetsApi, Dataset, DatasetItem, DatasetRun } from "../api/datasets";

export default function DatasetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"items" | "runs">("items");

  const dsQ = useQuery({
    queryKey: ["dataset", id],
    queryFn: () => datasetsApi.get(id!),
    enabled: !!id,
  });

  const itemsQ = useQuery({
    queryKey: ["dataset-items", id],
    queryFn: () => datasetsApi.listItems(id!),
    enabled: !!id && tab === "items",
  });

  const runsQ = useQuery({
    queryKey: ["dataset-runs", id],
    queryFn: () => datasetsApi.listRuns(id!),
    enabled: !!id && tab === "runs",
    refetchInterval: 5000,
  });

  if (dsQ.isLoading) return <div className="p-6 text-neutral-500">Loading...</div>;
  if (!dsQ.data) return <div className="p-6 text-red-600">Dataset not found</div>;

  const ds = dsQ.data;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-4 text-sm text-neutral-500">
        <Link to="/datasets" className="hover:underline">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Datasets
          </span>
        </Link>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">{ds.name}</h1>
            {ds.description && <p className="text-sm text-neutral-500 mt-1">{ds.description}</p>}
            <div className="flex items-center gap-4 mt-2 text-xs text-neutral-400">
              <span>{ds.item_count} items</span>
              <span>Created {new Date(ds.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <AddItemButton datasetId={ds.id} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 rounded-lg p-0.5 mb-4 w-fit">
        <button
          onClick={() => setTab("items")}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            tab === "items" ? "bg-white shadow-sm font-medium" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Items ({itemsQ.data?.length ?? ds.item_count})
        </button>
        <button
          onClick={() => setTab("runs")}
          className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
            tab === "runs" ? "bg-white shadow-sm font-medium" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          Runs ({runsQ.data?.length ?? 0})
        </button>
      </div>

      {/* Items tab */}
      {tab === "items" && (
        <ItemsTab datasetId={ds.id} items={itemsQ.data ?? []} isLoading={itemsQ.isLoading} />
      )}

      {/* Runs tab */}
      {tab === "runs" && (
        <RunsTab datasetId={ds.id} runs={runsQ.data ?? []} isLoading={runsQ.isLoading} />
      )}
    </div>
  );
}

// =============================================================================
// Add Item Button
// =============================================================================

function AddItemButton({ datasetId }: { datasetId: string }) {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");

  const mut = useMutation({
    mutationFn: (body: { input: unknown; expected_output?: unknown }) =>
      datasetsApi.createItem(datasetId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-items", datasetId] });
      queryClient.invalidateQueries({ queryKey: ["dataset", datasetId] });
      setShowForm(false);
      setInput("");
      setExpected("");
    },
  });

  const handleSubmit = () => {
    let parsedInput: unknown = input;
    try { parsedInput = JSON.parse(input); } catch { /* keep as string */ }
    let parsedExpected: unknown = expected || undefined;
    if (expected) {
      try { parsedExpected = JSON.parse(expected); } catch { /* keep as string */ }
    }
    mut.mutate({ input: parsedInput, expected_output: parsedExpected });
  };

  if (showForm) {
    return (
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 w-96">
        <div className="mb-2">
          <label className="text-xs font-medium text-neutral-600">Input (JSON or text)</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            className="w-full mt-1 rounded border border-neutral-300 px-2 py-1.5 text-sm font-mono"
            placeholder='{"question": "..."} or plain text'
          />
        </div>
        <div className="mb-2">
          <label className="text-xs font-medium text-neutral-600">Expected Output (optional)</label>
          <textarea
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
            rows={2}
            className="w-full mt-1 rounded border border-neutral-300 px-2 py-1.5 text-sm font-mono"
            placeholder='Expected response...'
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setShowForm(false)} className="text-xs text-neutral-500 px-2 py-1">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={!input || mut.isPending}
            className="bg-neutral-900 text-white rounded px-3 py-1 text-xs font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {mut.isPending ? "Adding..." : "Add Item"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowForm(true)}
      className="inline-flex items-center gap-1 bg-neutral-900 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-neutral-800"
    >
      <Plus className="h-3.5 w-3.5" />
      Add Item
    </button>
  );
}

// =============================================================================
// Items Tab
// =============================================================================

function ItemsTab({ datasetId, items, isLoading }: { datasetId: string; items: DatasetItem[]; isLoading: boolean }) {
  const queryClient = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: (itemId: string) => datasetsApi.deleteItem(datasetId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dataset-items", datasetId] });
      queryClient.invalidateQueries({ queryKey: ["dataset", datasetId] });
    },
  });

  if (isLoading) return <div className="text-neutral-500">Loading items...</div>;

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center">
        <p className="text-neutral-400">No items yet. Add test cases to run experiments.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-600 text-[11px] uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2 w-8">#</th>
            <th className="text-left px-4 py-2">Input</th>
            <th className="text-left px-4 py-2">Expected Output</th>
            <th className="text-center px-4 py-2 w-16">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id} className="border-t border-neutral-100 hover:bg-neutral-50">
              <td className="px-4 py-2 text-neutral-400 tabular-nums">{i + 1}</td>
              <td className="px-4 py-2 font-mono text-xs max-w-xs truncate">
                {typeof item.input === "string" ? item.input : JSON.stringify(item.input)}
              </td>
              <td className="px-4 py-2 font-mono text-xs max-w-xs truncate text-neutral-600">
                {item.expected_output
                  ? typeof item.expected_output === "string"
                    ? item.expected_output
                    : JSON.stringify(item.expected_output)
                  : "—"}
              </td>
              <td className="px-4 py-2 text-center">
                <button
                  onClick={() => { if (confirm("Delete this item?")) deleteMut.mutate(item.id); }}
                  className="text-red-500 hover:text-red-700 text-xs"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Runs Tab
// =============================================================================

function RunsTab({ datasetId, runs, isLoading }: { datasetId: string; runs: DatasetRun[]; isLoading: boolean }) {
  const queryClient = useQueryClient();

  const createMut = useMutation({
    mutationFn: (body: { name?: string }) => datasetsApi.createRun(datasetId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dataset-runs", datasetId] }),
  });

  if (isLoading) return <div className="text-neutral-500">Loading runs...</div>;

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => createMut.mutate({ name: `Run ${runs.length + 1}` })}
          disabled={createMut.isPending}
          className="inline-flex items-center gap-1 bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
        >
          {createMut.isPending ? "Starting..." : (<><Plus className="h-3.5 w-3.5" /> Start New Run</>)}
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center">
          <p className="text-neutral-400">No runs yet. Start an experiment to evaluate your dataset items.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-600 text-[11px] uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">Run</th>
                <th className="text-center px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Items</th>
                <th className="text-right px-4 py-2">Avg Score</th>
                <th className="text-left px-4 py-2">Created</th>
                <th className="text-center px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                  <td className="px-4 py-2 font-medium">{run.name || run.id}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      run.status === "completed" ? "bg-green-50 text-green-700" :
                      run.status === "running" ? "bg-blue-50 text-blue-700" :
                      run.status === "failed" ? "bg-red-50 text-red-700" :
                      "bg-neutral-100 text-neutral-600"
                    }`}>
                      {run.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {run.completed_items}/{run.total_items}
                    {run.failed_items > 0 && <span className="text-red-500"> ({run.failed_items} failed)</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">
                    {run.avg_score !== null ? run.avg_score.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500">
                    {new Date(run.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Link
                      to={`/datasets/${datasetId}/runs/${run.id}`}
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs"
                    >
                      View
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
