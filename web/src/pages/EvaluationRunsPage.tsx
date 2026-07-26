import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { evaluationApi, EvaluationRun, EvaluationRunDetail } from "../api/evaluation";
import { formatCost } from "../lib/format";

export default function EvaluationRunsPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const evaluatorId = searchParams.get("evaluatorId") || undefined;

  const q = useQuery({
    queryKey: ["evaluation-runs", evaluatorId],
    queryFn: () => evaluationApi.listRuns(evaluatorId ? { evaluatorId } : undefined),
    refetchInterval: 5000, // Poll for status updates
  });

  const runDetail = useQuery({
    queryKey: ["evaluation-run", selectedRunId],
    queryFn: () => evaluationApi.getRun(selectedRunId!),
    enabled: !!selectedRunId,
    refetchInterval: selectedRunId ? 3000 : false,
  });

  const handleCreateRun = async (evaluatorId: string) => {
    try {
      await evaluationApi.createRun({ evaluator_id: evaluatorId, limit: 50 });
      queryClient.invalidateQueries({ queryKey: ["evaluation-runs"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create run");
    }
  };

  const handleCancel = async (runId: string) => {
    if (!confirm("Cancel this evaluation run?")) return;
    await evaluationApi.cancelRun(runId);
    queryClient.invalidateQueries({ queryKey: ["evaluation-runs"] });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Evaluation Runs</h1>
          <p className="text-sm text-neutral-500 mt-1">
            <Link to="/evaluations" className="text-blue-600 hover:underline">← Back to Evaluators</Link>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Run list */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-neutral-200">
            <div className="px-4 py-3 border-b border-neutral-200">
              <h2 className="text-sm font-medium">Runs</h2>
            </div>
            {q.isLoading && <div className="p-4 text-neutral-500 text-sm">Loading...</div>}
            {q.data && q.data.length === 0 && (
              <div className="p-4 text-neutral-500 text-sm">No evaluation runs yet.</div>
            )}
            {q.data && q.data.length > 0 && (
              <ul className="divide-y divide-neutral-100">
                {q.data.map((run) => (
                  <li
                    key={run.id}
                    onClick={() => setSelectedRunId(run.id)}
                    className={`px-4 py-3 cursor-pointer hover:bg-neutral-50 ${
                      selectedRunId === run.id ? "bg-blue-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">
                        {run.evaluator_name || "Unknown"}
                      </span>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="text-xs text-neutral-500 mt-1">
                      {run.completed_traces}/{run.total_traces} traces
                      {run.avg_score !== null && ` · avg: ${run.avg_score.toFixed(1)}`}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {new Date(run.created_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Run detail */}
        <div className="lg:col-span-2">
          {!selectedRunId ? (
            <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center text-neutral-400">
              Select a run to see details
            </div>
          ) : runDetail.isLoading ? (
            <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center text-neutral-400">
              Loading...
            </div>
          ) : runDetail.data ? (
            <RunDetailView run={runDetail.data} onCancel={() => handleCancel(runDetail.data.id)} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-neutral-100 text-neutral-600",
    running: "bg-blue-50 text-blue-700",
    completed: "bg-green-50 text-green-700",
    failed: "bg-red-50 text-red-700",
    cancelled: "bg-yellow-50 text-yellow-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[status] || colors.pending}`}>
      {status}
    </span>
  );
}

function RunDetailView({ run, onCancel }: { run: EvaluationRunDetail; onCancel: () => void }) {
  const results = run.results || [];
  const completed = results.filter((r) => r.status === "completed");
  const failed = results.filter((r) => r.status === "failed");

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-medium">{run.evaluator_name || "Evaluation"}</h3>
            <p className="text-xs text-neutral-500">Run {run.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={run.status} />
            {(run.status === "running" || run.status === "pending") && (
              <button onClick={onCancel} className="text-xs text-red-600 hover:underline">
                Cancel
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-neutral-500">Total</div>
            <div className="text-lg font-semibold">{run.total_traces}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Completed</div>
            <div className="text-lg font-semibold text-green-600">{run.completed_traces}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Failed</div>
            <div className="text-lg font-semibold text-red-600">{run.failed_traces}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Avg Score</div>
            <div className="text-lg font-semibold">{run.avg_score !== null ? run.avg_score.toFixed(2) : "—"}</div>
          </div>
        </div>

        {/* Score distribution */}
        {run.score_distribution && Object.keys(run.score_distribution).length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-neutral-500 mb-2">Score Distribution</div>
            <div className="flex items-end gap-1 h-16">
              {Object.entries(run.score_distribution)
                .sort(([a], [b]) => Number(a) - Number(b))
                .map(([score, count]) => {
                  const maxCount = Math.max(...Object.values(run.score_distribution!));
                  const height = (count / maxCount) * 100;
                  return (
                    <div key={score} className="flex-1 flex flex-col items-center">
                      <div
                        className="w-full bg-blue-400 rounded-t"
                        style={{ height: `${height}%`, minHeight: 2 }}
                      />
                      <span className="text-[10px] text-neutral-500 mt-1">{score}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Results table */}
      <div className="bg-white rounded-lg border border-neutral-200">
        <div className="px-4 py-3 border-b border-neutral-200">
          <h3 className="text-sm font-medium">Results ({results.length})</h3>
        </div>
        {results.length === 0 ? (
          <div className="p-6 text-center text-neutral-400 text-sm">
            {run.status === "running" ? "Evaluating traces..." : "No results"}
          </div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Trace</th>
                  <th className="text-right px-3 py-2">Score</th>
                  <th className="text-left px-3 py-2">Reasoning</th>
                  <th className="text-center px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-2">
                      <Link
                        to={`/traces/${r.trace_id}`}
                        className="text-blue-600 hover:underline font-mono text-xs"
                      >
                        {r.trace_name || r.trace_id.substring(0, 16)}
                      </Link>
                      {r.trace_user_id && (
                        <span className="ml-1 text-neutral-400 text-xs">{r.trace_user_id}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {r.score_value !== null ? r.score_value.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-neutral-600 text-xs max-w-xs truncate">
                      {r.reasoning || r.error_message || "—"}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
