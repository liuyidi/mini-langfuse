import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ExternalLink, Play } from "lucide-react";
import { api, PromptVersion } from "../api/client";
import { formatTime } from "../lib/format";
import JsonViewer from "../components/JsonViewer";

function versionText(v: PromptVersion): string {
  if (v.type === "text") return String(v.content ?? "");
  return JSON.stringify(v.content, null, 2);
}

// Simple line-level diff highlighting
function diffLines(a: string, b: string): { left: (string | null)[]; right: (string | null)[] } {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  const left: (string | null)[] = [];
  const right: (string | null)[] = [];
  for (let i = 0; i < n; i++) {
    left.push(i < la.length ? la[i] : null);
    right.push(i < lb.length ? lb[i] : null);
  }
  return { left, right };
}

export default function PromptDetailPage() {
  const { name } = useParams<{ name: string }>();
  const decoded = name ? decodeURIComponent(name) : "";
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["prompt", decoded],
    queryFn: () => api.getPrompt(decoded),
    enabled: !!decoded,
  });

  const versions = q.data?.versions ?? [];
  const [leftVer, setLeftVer] = useState<number | null>(null);
  const [rightVer, setRightVer] = useState<number | null>(null);

  // On first data arrival, default: right = latest, left = previous
  const defaultsSet = useMemo(() => {
    if (versions.length === 0) return false;
    if (leftVer == null && rightVer == null) {
      const latest = versions[0].version;
      const prev = versions[1]?.version ?? latest;
      setRightVer(latest);
      setLeftVer(prev);
    }
    return true;
  }, [versions, leftVer, rightVer]);
  void defaultsSet;

  const left = versions.find((v) => v.version === leftVer) ?? versions[versions.length - 1];
  const right = versions.find((v) => v.version === rightVer) ?? versions[0];

  const updateLabels = useMutation({
    mutationFn: ({ versionId, labels }: { versionId: string; labels: string[] }) =>
      api.updatePromptLabels(versionId, labels),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompt", decoded] }),
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4 text-sm text-neutral-500">
        <Link to="/prompts" className="hover:underline">
          <span className="inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to prompts
          </span>
        </Link>
      </div>

      {q.isLoading && <div>Loading…</div>}
      {q.isError && (
        <div className="text-red-600 text-sm">
          Error: {String((q.error as Error).message)}
        </div>
      )}

      {q.data && (
        <>
          <div className="bg-white border border-neutral-200 rounded-md p-4 mb-4">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold font-mono">{q.data.name}</h1>
              <span className="text-xs text-neutral-500">
                {versions.length} version{versions.length === 1 ? "" : "s"}
              </span>
              <Link
                to={`/prompts/${encodeURIComponent(decoded)}/playground`}
                className="ml-auto inline-flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Playground
              </Link>
            </div>
          </div>

          {/* Versions table */}
          <div className="bg-white border border-neutral-200 rounded-md p-3 mb-6">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 px-2 pb-2">
              Versions
            </div>
            <table className="min-w-full text-sm">
              <thead className="text-neutral-500 text-[11px] uppercase tracking-wide">
                <tr>
                  <th className="text-left px-2 py-1">Version</th>
                  <th className="text-left px-2 py-1">Type</th>
                  <th className="text-left px-2 py-1">Labels</th>
                  <th className="text-left px-2 py-1">Commit</th>
                  <th className="text-left px-2 py-1">Created</th>
                  <th className="px-2 py-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id} className="border-t border-neutral-100">
                    <td className="px-2 py-1 font-mono">v{v.version}</td>
                    <td className="px-2 py-1">{v.type}</td>
                    <td className="px-2 py-1">
                      <div className="flex gap-1 flex-wrap">
                        {(v.labels ?? []).map((lb) => (
                          <span key={lb} className="inline-flex items-center rounded bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 font-semibold">
                            {lb}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1 text-neutral-600 text-xs">{v.commit_msg ?? "—"}</td>
                    <td className="px-2 py-1 whitespace-nowrap text-xs">{formatTime(v.created_at)}</td>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            const next = (v.labels ?? []).includes("production")
                              ? (v.labels ?? []).filter((x) => x !== "production")
                              : [...(v.labels ?? []), "production"];
                            updateLabels.mutate({ versionId: v.id, labels: next });
                          }}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {(v.labels ?? []).includes("production")
                            ? "Remove production"
                            : "Mark production"}
                        </button>
                        <Link
                          to={`/prompts/${encodeURIComponent(decoded)}/playground?version=${v.version}`}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Play className="h-3 w-3" />
                          Try
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Diff */}
          {versions.length >= 1 && left && right && (
            <div className="bg-white border border-neutral-200 rounded-md p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="text-[11px] uppercase tracking-wider text-neutral-500">
                  Compare versions
                </div>
                <select
                  value={leftVer ?? ""}
                  onChange={(e) => setLeftVer(Number(e.target.value))}
                  className="border border-neutral-300 rounded px-1 py-0.5 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
                <ArrowRight className="h-3.5 w-3.5 text-neutral-400" />
                <select
                  value={rightVer ?? ""}
                  onChange={(e) => setRightVer(Number(e.target.value))}
                  className="border border-neutral-300 rounded px-1 py-0.5 text-sm"
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </div>

              {left.id === right.id ? (
                <JsonViewer value={left.content} />
              ) : (
                <DiffView left={versionText(left)} right={versionText(right)} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DiffView({ left, right }: { left: string; right: string }) {
  const d = diffLines(left, right);
  return (
    <div className="grid grid-cols-2 gap-3">
      <DiffColumn lines={d.left} other={d.right} tone="removed" />
      <DiffColumn lines={d.right} other={d.left} tone="added" />
    </div>
  );
}

function DiffColumn({
  lines,
  other,
  tone,
}: {
  lines: (string | null)[];
  other: (string | null)[];
  tone: "removed" | "added";
}) {
  return (
    <pre className="text-xs font-mono bg-neutral-50 border border-neutral-200 rounded p-3 overflow-auto max-h-[600px] whitespace-pre-wrap">
      {lines.map((ln, i) => {
        const changed = ln !== other[i];
        const bg = changed
          ? tone === "removed"
            ? "bg-red-100"
            : "bg-emerald-100"
          : "";
        return (
          <div key={i} className={bg}>
            {ln ?? ""}
          </div>
        );
      })}
    </pre>
  );
}
