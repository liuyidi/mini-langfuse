import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, Score } from "../api/client";
import { formatTime } from "../lib/format";

type Props = { traceId: string; observationId?: string | null };

export default function ScoresPanel({ traceId, observationId }: Props) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["scores", traceId],
    queryFn: () => api.listScores({ traceId }),
  });

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
    },
    onError: (e: Error) => setErr(e.message),
  });

  const scores = q.data?.data ?? [];
  const relevant = observationId
    ? scores.filter((s) => s.observation_id === observationId)
    : scores;

  return (
    <div className="space-y-3">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">
        Scores {observationId ? "(this observation)" : "(this trace)"}
      </div>

      {relevant.length === 0 ? (
        <div className="text-sm text-neutral-400">No scores yet.</div>
      ) : (
        <ul className="space-y-1">
          {relevant.map((s: Score) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-neutral-700">{s.name}</span>
              <span className="font-mono font-semibold">
                {s.data_type === "CATEGORICAL" ? s.string_value : s.value}
              </span>
              <span className="text-[10px] uppercase tracking-wider rounded bg-neutral-100 text-neutral-600 px-1.5 py-0.5">
                {s.source}
              </span>
              {s.comment && (
                <span className="text-neutral-500 text-xs italic truncate">
                  “{s.comment}”
                </span>
              )}
              <span className="text-neutral-400 text-xs ml-auto whitespace-nowrap">
                {formatTime(s.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3"
      >
        <input
          className="border border-neutral-300 rounded px-2 py-1 text-sm w-32"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="name"
        />
        <select
          className="border border-neutral-300 rounded px-1 py-1 text-sm"
          value={dataType}
          onChange={(e) => setDataType(e.target.value as typeof dataType)}
        >
          <option value="NUMERIC">Numeric</option>
          <option value="CATEGORICAL">Categorical</option>
          <option value="BOOLEAN">Boolean</option>
        </select>
        {dataType === "BOOLEAN" ? (
          <select
            className="border border-neutral-300 rounded px-1 py-1 text-sm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">–</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            className="border border-neutral-300 rounded px-2 py-1 text-sm w-24"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={dataType === "NUMERIC" ? "0-1" : "label"}
          />
        )}
        <input
          className="border border-neutral-300 rounded px-2 py-1 text-sm flex-1 min-w-[8rem]"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="optional comment"
        />
        <button
          disabled={create.isPending}
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm rounded px-3 py-1"
        >
          {create.isPending ? "Saving…" : "Add score"}
        </button>
      </form>
      {err && <div className="text-red-600 text-xs">{err}</div>}
    </div>
  );
}
