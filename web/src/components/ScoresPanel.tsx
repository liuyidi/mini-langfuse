import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Score } from "../api/client";
import { formatTime } from "../lib/format";

const DEMO_PK = "pk-lf-demo";
const DEMO_SK = "sk-lf-demo";
const authHeader = "Basic " + btoa(`${DEMO_PK}:${DEMO_SK}`);

type Props = { traceId: string; observationId?: string | null };

// Score color coding
function scoreColor(value: number | null, dataType: string): string {
  if (dataType === "BOOLEAN") return value === 1 ? "text-green-600" : "text-red-600";
  if (value === null) return "text-neutral-400";
  if (value >= 4) return "text-green-600";
  if (value >= 2.5) return "text-yellow-600";
  return "text-red-600";
}

function scoreBg(value: number | null, dataType: string): string {
  if (dataType === "BOOLEAN") return value === 1 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200";
  if (value === null) return "bg-neutral-50 border-neutral-200";
  if (value >= 4) return "bg-green-50 border-green-200";
  if (value >= 2.5) return "bg-yellow-50 border-yellow-200";
  return "bg-red-50 border-red-200";
}

export default function ScoresPanel({ traceId, observationId }: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["scores", traceId, observationId],
    queryFn: () => api.listScores({ traceId }),
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("helpfulness");
  const [dataType, setDataType] = useState<"NUMERIC" | "CATEGORICAL" | "BOOLEAN">("NUMERIC");
  const [value, setValue] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => {
      const body: Parameters<typeof api.createScore>[0] = {
        traceId,
        name,
        dataType,
        source: "HUMAN",
        comment: comment || undefined,
        observationId: observationId || undefined,
      };
      if (dataType === "CATEGORICAL") body.stringValue = value;
      else if (dataType === "BOOLEAN") body.value = value === "true" ? 1 : 0;
      else body.value = value === "" ? 0 : Number(value);
      return api.createScore(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scores", traceId] });
      setValue("");
      setComment("");
      setErr(null);
      setShowForm(false);
    },
    onError: (e: Error) => setErr(e.message),
  });

  const deleteScore = useMutation({
    mutationFn: async (scoreId: string) => {
      const r = await fetch(`/api/public/scores/${scoreId}`, {
        method: "DELETE",
        headers: { Authorization: authHeader },
      });
      if (!r.ok) throw new Error("Failed to delete score");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scores", traceId] });
    },
  });

  const scores = q.data?.data ?? [];
  const humanScores = scores.filter((s) => s.source === "HUMAN");
  const apiScores = scores.filter((s) => s.source === "API");
  const evalScores = scores.filter((s) => s.source === "EVAL");

  // Show observation-specific scores or all trace scores
  const relevant = observationId
    ? scores.filter((s) => s.observation_id === observationId)
    : scores;

  const handleQuickScore = (scoreValue: number) => {
    setName("helpfulness");
    setDataType("NUMERIC");
    setValue(String(scoreValue));
    setComment("");
    create.mutate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-neutral-500">
          Scores {observationId ? "(this observation)" : "(this trace)"}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
        >
          {showForm ? "Cancel" : "+ Add Score"}
        </button>
      </div>

      {/* Quick score buttons */}
      {!showForm && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Quick rate:</span>
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              onClick={() => handleQuickScore(v)}
              disabled={create.isPending}
              className={`w-8 h-8 rounded-md border text-sm font-semibold transition-colors ${scoreBg(v, "NUMERIC")} hover:opacity-80 disabled:opacity-50`}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {/* Score form */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-neutral-500">Dimension</label>
              <select value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white">
                <option value="helpfulness">Helpfulness</option>
                <option value="accuracy">Accuracy</option>
                <option value="safety">Safety</option>
                <option value="relevance">Relevance</option>
                <option value="completeness">Completeness</option>
                <option value="creativity">Creativity</option>
                <option value="overall">Overall Quality</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Type</label>
              <select value={dataType} onChange={(e) => setDataType(e.target.value as typeof dataType)} className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm bg-white">
                <option value="NUMERIC">Numeric (1-5)</option>
                <option value="CATEGORICAL">Categorical</option>
                <option value="BOOLEAN">Boolean (pass/fail)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-neutral-500">Score</label>
            {dataType === "NUMERIC" ? (
              <div className="flex items-center gap-1.5 mt-1">
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setValue(String(v))}
                    className={`w-9 h-9 rounded-md border text-sm font-semibold transition-all ${
                      value === String(v)
                        ? scoreBg(v, "NUMERIC") + " border-current scale-110"
                        : "border-neutral-200 hover:border-neutral-400"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            ) : dataType === "BOOLEAN" ? (
              <div className="flex items-center gap-2 mt-1">
                <button type="button" onClick={() => setValue("true")} className={`px-4 py-2 rounded-md border text-sm font-medium ${value === "true" ? "bg-green-50 border-green-300 text-green-700" : "border-neutral-200"}`}>
                  👍 Pass
                </button>
                <button type="button" onClick={() => setValue("false")} className={`px-4 py-2 rounded-md border text-sm font-medium ${value === "false" ? "bg-red-50 border-red-300 text-red-700" : "border-neutral-200"}`}>
                  👎 Fail
                </button>
              </div>
            ) : (
              <input
                className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm mt-1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. good / bad / neutral"
              />
            )}
          </div>

          <div>
            <label className="text-xs text-neutral-500">Comment (optional)</label>
            <textarea
              className="w-full border border-neutral-300 rounded px-2 py-1.5 text-sm mt-1"
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Why did you give this score?"
            />
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-neutral-500 hover:text-neutral-700 px-3 py-1.5">
              Cancel
            </button>
            <button
              type="submit"
              disabled={create.isPending || !value}
              className="bg-neutral-900 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
            >
              {create.isPending ? "Saving…" : "Save Score"}
            </button>
          </div>
          {err && <div className="text-red-600 text-xs">{err}</div>}
        </form>
      )}

      {/* Score list */}
      {relevant.length === 0 ? (
        <div className="text-sm text-neutral-400 text-center py-4">
          No scores yet. Click "+ Add Score" or use quick rate to annotate.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Human scores */}
          {humanScores.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Human</div>
              {humanScores.map((s) => (
                <ScoreRow key={s.id} score={s} onDelete={() => deleteScore.mutate(s.id)} />
              ))}
            </div>
          )}
          {/* Eval scores */}
          {evalScores.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">LLM Judge</div>
              {evalScores.map((s) => (
                <ScoreRow key={s.id} score={s} />
              ))}
            </div>
          )}
          {/* API scores */}
          {apiScores.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">API</div>
              {apiScores.map((s) => (
                <ScoreRow key={s.id} score={s} onDelete={() => deleteScore.mutate(s.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreRow({ score, onDelete }: { score: Score; onDelete?: () => void }) {
  const displayValue = score.data_type === "CATEGORICAL" ? score.string_value : score.value;
  const numValue = typeof score.value === "number" ? score.value : null;

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-neutral-50 group">
      <span className="font-medium text-sm text-neutral-700 min-w-[80px]">{score.name}</span>
      <span className={`font-semibold text-sm tabular-nums ${scoreColor(numValue, score.data_type)}`}>
        {displayValue}
      </span>
      {score.comment && (
        <span className="text-neutral-500 text-xs italic truncate max-w-[200px]">
          "{score.comment}"
        </span>
      )}
      <span className="text-neutral-400 text-xs ml-auto">
        {formatTime(score.created_at)}
      </span>
      {onDelete && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 text-xs ml-1"
          title="Delete score"
        >
          ✕
        </button>
      )}
    </div>
  );
}
