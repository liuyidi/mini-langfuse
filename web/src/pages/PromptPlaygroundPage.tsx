import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, PromptVersion } from "../api/client";
import { formatCost, formatDuration } from "../lib/format";

type ChatMessage = { role: string; content: string };

// Extract {{var}} placeholders from all messages (unique, order-preserved)
function extractVariables(messages: ChatMessage[]): string[] {
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of messages) {
    if (typeof m.content !== "string") continue;
    let match: RegExpExecArray | null;
    while ((match = re.exec(m.content)) !== null) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    }
  }
  return out;
}

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, key) =>
    key in vars ? vars[key] : m,
  );
}

function versionToMessages(v: PromptVersion): ChatMessage[] {
  if (v.type === "chat" && Array.isArray(v.content)) {
    return (v.content as any[]).map((x) => ({
      role: String(x.role ?? "user"),
      content: String(x.content ?? ""),
    }));
  }
  return [{ role: "user", content: String(v.content ?? "") }];
}

const PROVIDERS = [
  { value: "mock", label: "Mock (no key)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
];

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  mock: ["mock-model"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
  anthropic: ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022"],
};

export default function PromptPlaygroundPage() {
  const { name } = useParams<{ name: string }>();
  const decoded = name ? decodeURIComponent(name) : "";
  const [search] = useSearchParams();
  const versionFromQs = search.get("version");
  const qc = useQueryClient();

  const promptQ = useQuery({
    queryKey: ["prompt", decoded],
    queryFn: () => api.getPrompt(decoded),
    enabled: !!decoded,
  });

  const versions = promptQ.data?.versions ?? [];
  const initialVersion = useMemo(() => {
    if (versions.length === 0) return null;
    if (versionFromQs) {
      const v = versions.find((x) => x.version === Number(versionFromQs));
      if (v) return v;
    }
    return versions[0]; // latest first
  }, [versions, versionFromQs]);

  const [provider, setProvider] = useState<string>("mock");
  const [model, setModel] = useState<string>("mock-model");
  const [temperature, setTemperature] = useState<string>("0.7");
  const [maxTokens, setMaxTokens] = useState<string>("512");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello {{name}}" },
  ]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [result, setResult] = useState<
    | null
    | {
        content: string;
        usage: { prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null };
        latency_ms: number;
        total_cost_usd: number | null;
        trace_id: string;
      }
  >(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [labelProduction, setLabelProduction] = useState(false);

  // Load selected version → messages
  useEffect(() => {
    if (initialVersion) {
      setMessages(versionToMessages(initialVersion));
    }
  }, [initialVersion?.id]);

  // Adjust default model when provider changes
  useEffect(() => {
    const suggestions = MODEL_SUGGESTIONS[provider] || [];
    if (suggestions.length && !suggestions.includes(model)) {
      setModel(suggestions[0]);
    }
  }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  const varNames = extractVariables(messages);
  const compiledMessages = messages.map((m) => ({
    ...m,
    content: substitute(m.content, vars),
  }));

  const run = useMutation({
    mutationFn: () =>
      api.playgroundRun({
        provider,
        model,
        messages: compiledMessages,
        params: {
          temperature: Number(temperature),
          max_tokens: Number(maxTokens),
        },
        promptName: decoded,
        promptVersionId: initialVersion?.id,
        variables: vars,
      }),
    onSuccess: (r) => {
      setResult({
        content: r.content,
        usage: r.usage,
        latency_ms: r.latency_ms,
        total_cost_usd: r.total_cost_usd,
        trace_id: r.trace_id,
      });
      setRunError(null);
      qc.invalidateQueries({ queryKey: ["traces"] });
    },
    onError: (e: Error) => setRunError(e.message),
  });

  const save = useMutation({
    mutationFn: () =>
      api.createPromptVersion({
        name: decoded,
        type: "chat",
        content: messages,
        labels: labelProduction ? ["production"] : undefined,
        commitMessage: commitMsg || undefined,
      }),
    onSuccess: () => {
      setSaveOpen(false);
      setCommitMsg("");
      setLabelProduction(false);
      qc.invalidateQueries({ queryKey: ["prompt", decoded] });
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4 text-sm text-neutral-500 flex items-center gap-3">
        <Link to={`/prompts/${encodeURIComponent(decoded)}`} className="hover:underline">
          ← Back to prompt
        </Link>
        <span>·</span>
        <Link to="/prompts" className="hover:underline">
          All prompts
        </Link>
      </div>

      <div className="bg-white border border-neutral-200 rounded-md p-4 mb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold font-mono">
            Playground: {decoded}
          </h1>
          {initialVersion && (
            <span className="text-xs text-neutral-500 font-mono">
              editing based on v{initialVersion.version}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <Field label="Provider">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="border border-neutral-300 rounded px-2 py-1 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model">
            <input
              list={`models-${provider}`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border border-neutral-300 rounded px-2 py-1 text-sm w-52 font-mono"
            />
            <datalist id={`models-${provider}`}>
              {(MODEL_SUGGESTIONS[provider] || []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
          <Field label="Temperature">
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="border border-neutral-300 rounded px-2 py-1 text-sm w-20"
            />
          </Field>
          <Field label="Max tokens">
            <input
              type="number"
              min="1"
              max="8192"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              className="border border-neutral-300 rounded px-2 py-1 text-sm w-24"
            />
          </Field>
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm rounded px-4 py-1.5 font-medium ml-auto"
          >
            {run.isPending ? "Running…" : "▶ Run"}
          </button>
          <button
            onClick={() => setSaveOpen(true)}
            className="border border-neutral-300 hover:bg-neutral-50 text-sm rounded px-3 py-1.5"
          >
            Save as new version…
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4">
        {/* Left: messages editor */}
        <div className="bg-white border border-neutral-200 rounded-md p-4 space-y-3">
          <div className="text-[11px] uppercase tracking-wider text-neutral-500">
            Messages
          </div>
          {messages.map((m, i) => (
            <MessageRow
              key={i}
              msg={m}
              onChange={(next) =>
                setMessages((ms) => ms.map((x, j) => (j === i ? next : x)))
              }
              onRemove={() =>
                setMessages((ms) => ms.filter((_, j) => j !== i))
              }
            />
          ))}
          <button
            onClick={() =>
              setMessages((ms) => [...ms, { role: "user", content: "" }])
            }
            className="text-sm text-blue-600 hover:underline"
          >
            + Add message
          </button>
        </div>

        {/* Right: variables + response */}
        <div className="space-y-4">
          {varNames.length > 0 && (
            <div className="bg-white border border-neutral-200 rounded-md p-4">
              <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
                Variables ({varNames.length})
              </div>
              <div className="space-y-2">
                {varNames.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <label className="font-mono text-sm text-neutral-700 w-24 truncate">
                      {name}
                    </label>
                    <input
                      value={vars[name] || ""}
                      onChange={(e) =>
                        setVars((v) => ({ ...v, [name]: e.target.value }))
                      }
                      className="border border-neutral-300 rounded px-2 py-1 text-sm flex-1 font-mono"
                      placeholder={`value for {{${name}}}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-neutral-200 rounded-md p-4">
            <div className="text-[11px] uppercase tracking-wider text-neutral-500 mb-2">
              Response
            </div>
            {runError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2 mb-2">
                {runError}
              </div>
            )}
            {!result && !run.isPending && !runError && (
              <div className="text-sm text-neutral-400">
                Run the prompt to see the model output here.
              </div>
            )}
            {run.isPending && (
              <div className="text-sm text-neutral-500">Calling {provider}:{model}…</div>
            )}
            {result && (
              <>
                <pre className="text-sm font-mono whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded p-3 max-h-96 overflow-auto">
                  {result.content}
                </pre>
                <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                  <Stat
                    label="Latency"
                    value={formatDuration(result.latency_ms)}
                  />
                  <Stat
                    label="Tokens (in/out)"
                    value={`${result.usage.prompt_tokens ?? "—"}/${result.usage.completion_tokens ?? "—"}`}
                  />
                  <Stat
                    label="Cost"
                    value={formatCost(result.total_cost_usd)}
                  />
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  Saved as trace{" "}
                  <Link
                    to={`/traces/${result.trace_id}`}
                    className="text-blue-600 hover:underline font-mono"
                  >
                    {result.trace_id}
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Save dialog */}
      {saveOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-md border border-neutral-200 p-5 w-[420px] shadow-lg">
            <h3 className="text-lg font-semibold mb-3">
              Save as new version of{" "}
              <span className="font-mono">{decoded}</span>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1">
                  Commit message
                </label>
                <input
                  value={commitMsg}
                  onChange={(e) => setCommitMsg(e.target.value)}
                  placeholder="What changed?"
                  className="border border-neutral-300 rounded px-2 py-1 text-sm w-full"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={labelProduction}
                  onChange={(e) => setLabelProduction(e.target.checked)}
                />
                Set <span className="font-mono">production</span> label to this
                version
              </label>
              {save.isError && (
                <div className="text-sm text-red-700">
                  {(save.error as Error).message}
                </div>
              )}
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => setSaveOpen(false)}
                className="text-sm px-3 py-1 rounded border border-neutral-300 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending}
                className="text-sm px-4 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
              >
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageRow({
  msg,
  onChange,
  onRemove,
}: {
  msg: ChatMessage;
  onChange: (m: ChatMessage) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex gap-2 items-start">
      <select
        value={msg.role}
        onChange={(e) => onChange({ ...msg, role: e.target.value })}
        className="border border-neutral-300 rounded px-2 py-1 text-sm w-24 shrink-0"
      >
        <option value="system">system</option>
        <option value="user">user</option>
        <option value="assistant">assistant</option>
      </select>
      <textarea
        value={msg.content}
        onChange={(e) => onChange({ ...msg, content: e.target.value })}
        rows={Math.max(2, msg.content.split("\n").length)}
        className="border border-neutral-300 rounded px-2 py-1 text-sm flex-1 font-mono"
      />
      <button
        onClick={onRemove}
        className="text-neutral-400 hover:text-red-600 text-lg leading-none shrink-0 mt-1"
        title="Remove"
      >
        ×
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div className="font-mono">{value}</div>
    </div>
  );
}
