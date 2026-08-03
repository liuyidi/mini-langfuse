import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, Trace } from "../api/client";
import { getProjectAuthHeader } from "../lib/projectAuth";
import { formatCost, formatDuration, formatNum, formatTime } from "../lib/format";

export default function AnnotationQueuePage() {
  const queryClient = useQueryClient();
  const [dimension, setDimension] = useState("helpfulness");
  const [filterScored, setFilterScored] = useState(false);

  // Fetch traces
  const tracesQ = useQuery({
    queryKey: ["traces", "annotation"],
    queryFn: () => api.listTraces({ limit: "100" }),
  });

  // Fetch all scores
  const scoresQ = useQuery({
    queryKey: ["scores", "all"],
    queryFn: async () => {
      const r = await fetch(`/api/public/scores?limit=500`, {
        headers: { Authorization: getProjectAuthHeader() },
      });
      if (!r.ok) throw new Error("Failed to fetch scores");
      return r.json();
    },
  });

  const traces = tracesQ.data?.data ?? [];
  const allScores = scoresQ.data?.data ?? [];

  // Build a map of trace_id -> has human score for this dimension
  const traceScores = new Map<string, { score: number | string; comment?: string | null }>();
  for (const s of allScores) {
    if (s.source === "HUMAN" && s.name === dimension && !s.observation_id) {
      traceScores.set(s.trace_id, {
        score: s.data_type === "CATEGORICAL" ? s.string_value! : s.value!,
        comment: s.comment,
      });
    }
  }

  const scored = traces.filter((t) => traceScores.has(t.id));
  const unscored = traces.filter((t) => !traceScores.has(t.id));
  const displayTraces = filterScored ? scored : unscored;

  const total = traces.length;
  const annotated = scored.length;
  const pending = unscored.length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Annotation Queue</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Review and annotate traces with human quality scores.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm">
            <span className="font-semibold text-green-600">{annotated}</span>
            <span className="text-neutral-500"> / {total} annotated</span>
          </div>
          <div className="w-32 h-2 bg-neutral-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${total ? (annotated / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-4 bg-white border border-neutral-200 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600">Dimension:</label>
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            className="border border-neutral-300 rounded px-2 py-1 text-sm"
          >
            <option value="helpfulness">Helpfulness</option>
            <option value="accuracy">Accuracy</option>
            <option value="safety">Safety</option>
            <option value="relevance">Relevance</option>
            <option value="completeness">Completeness</option>
            <option value="creativity">Creativity</option>
            <option value="overall">Overall Quality</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600">Show:</label>
          <select
            value={filterScored ? "scored" : "unscored"}
            onChange={(e) => setFilterScored(e.target.value === "scored")}
            className="border border-neutral-300 rounded px-2 py-1 text-sm"
          >
            <option value="unscored">Pending ({pending})</option>
            <option value="scored">Scored ({annotated})</option>
          </select>
        </div>
      </div>

      {/* Trace list with inline annotation */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-600 text-[11px] uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2 w-[140px]">Time</th>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">User</th>
              <th className="text-right px-4 py-2 w-[80px]">Duration</th>
              <th className="text-right px-4 py-2 w-[60px]">Tokens</th>
              <th className="text-right px-4 py-2 w-[70px]">Cost</th>
              <th className="text-center px-4 py-2 w-[160px]">Score (1-5)</th>
            </tr>
          </thead>
          <tbody>
            {displayTraces.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-neutral-400">
                  {filterScored ? "No scored traces yet." : "All traces have been annotated! 🎉"}
                </td>
              </tr>
            ) : (
              displayTraces.map((t) => (
                <TraceRow
                  key={t.id}
                  trace={t}
                  dimension={dimension}
                  existingScore={traceScores.get(t.id)}
                  onScored={() => {
                    queryClient.invalidateQueries({ queryKey: ["scores", "all"] });
                  }}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TraceRow({
  trace,
  dimension,
  existingScore,
  onScored,
}: {
  trace: Trace;
  dimension: string;
  existingScore?: { score: number | string; comment?: string | null };
  onScored: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [value, setValue] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!value) return;
    setSaving(true);
    try {
      const r = await fetch("/api/public/scores", {
        method: "POST",
        headers: {
          Authorization: getProjectAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          traceId: trace.id,
          name: dimension,
          dataType: "NUMERIC",
          value: Number(value),
          source: "HUMAN",
          comment: comment || undefined,
        }),
      });
      if (!r.ok) throw new Error("Failed to save score");
      setShowForm(false);
      setValue("");
      setComment("");
      onScored();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr className="border-t border-neutral-100 hover:bg-neutral-50">
        <td className="px-4 py-2 whitespace-nowrap">
          <Link to={`/traces/${trace.id}`} className="text-blue-600 hover:underline text-xs">
            {formatTime(trace.timestamp)}
          </Link>
        </td>
        <td className="px-4 py-2 font-mono text-xs">{trace.name ?? "—"}</td>
        <td className="px-4 py-2 text-neutral-600 text-xs">{trace.user_id ?? "—"}</td>
        <td className="px-4 py-2 text-right tabular-nums text-xs">{formatDuration(trace.duration_ms)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-xs">{formatNum(trace.total_tokens)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-xs">{formatCost(trace.total_cost_usd)}</td>
        <td className="px-4 py-2">
          {existingScore ? (
            <div className="flex items-center justify-center gap-2">
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                typeof existingScore.score === "number" && existingScore.score >= 4
                  ? "bg-green-100 text-green-700"
                  : typeof existingScore.score === "number" && existingScore.score >= 3
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-red-100 text-red-700"
              }`}>
                {existingScore.score}
              </span>
              <button
                onClick={() => setShowForm(!showForm)}
                className="text-xs text-neutral-400 hover:text-neutral-700"
              >
                {showForm ? "✕" : "edit"}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-1">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  onClick={() => {
                    setValue(String(v));
                    handleSubmit();
                  }}
                  className="w-6 h-6 rounded text-xs font-medium border border-neutral-200 hover:bg-neutral-100 transition-colors"
                >
                  {v}
                </button>
              ))}
              <button
                onClick={() => setShowForm(!showForm)}
                className="text-xs text-neutral-400 hover:text-neutral-700 ml-1"
                title="Add with comment"
              >
                +
              </button>
            </div>
          )}
        </td>
      </tr>
      {showForm && (
        <tr className="border-t border-neutral-100 bg-blue-50">
          <td colSpan={7} className="px-4 py-3">
            <div className="flex items-end gap-3">
              <div>
                <label className="text-xs text-neutral-500">Score</label>
                <div className="flex items-center gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setValue(String(v))}
                      className={`w-8 h-8 rounded border text-sm font-semibold ${
                        value === String(v) ? "bg-blue-600 text-white border-blue-600" : "border-neutral-300 bg-white"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <label className="text-xs text-neutral-500">Comment</label>
                <input
                  className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm mt-1"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Optional comment..."
                />
              </div>
              <button
                onClick={handleSubmit}
                disabled={saving || !value}
                className="bg-blue-600 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="text-sm text-neutral-500 hover:text-neutral-700 px-2 py-1.5"
              >
                Cancel
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
