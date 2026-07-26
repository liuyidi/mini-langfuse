import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { evaluationApi, Evaluator } from "../api/evaluation";

export default function EvaluatorsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const q = useQuery({
    queryKey: ["evaluators"],
    queryFn: () => evaluationApi.listEvaluators(),
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this evaluator?")) return;
    await evaluationApi.deleteEvaluator(id);
    queryClient.invalidateQueries({ queryKey: ["evaluators"] });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Evaluators</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Define automated evaluators to score traces using LLM-as-a-judge.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800"
        >
          {showCreate ? "Cancel" : "+ New Evaluator"}
        </button>
      </div>

      {showCreate && <CreateEvaluatorForm onCreated={() => { setShowCreate(false); queryClient.invalidateQueries({ queryKey: ["evaluators"] }); }} />}

      {q.isLoading && <div className="text-neutral-500">Loading...</div>}

      {q.data && q.data.length === 0 && !showCreate && (
        <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center">
          <p className="text-neutral-500 mb-4">No evaluators yet. Create one to start scoring traces automatically.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800"
          >
            + Create Evaluator
          </button>
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="space-y-3">
          {q.data.map((e) => (
            <EvaluatorCard key={e.id} evaluator={e} onDelete={() => handleDelete(e.id)} />
          ))}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-4">Evaluation Runs</h2>
        <Link
          to="/evaluations/runs"
          className="text-blue-600 hover:underline text-sm"
        >
          View all evaluation runs →
        </Link>
      </div>
    </div>
  );
}

function EvaluatorCard({ evaluator, onDelete }: { evaluator: Evaluator; onDelete: () => void }) {
  const config = evaluator.config;
  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{evaluator.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              evaluator.is_active ? "bg-green-50 text-green-700" : "bg-neutral-100 text-neutral-500"
            }`}>
              {evaluator.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <div className="text-sm text-neutral-500 mt-1 space-x-3">
            <span>Type: {evaluator.evaluator_type}</span>
            <span>Model: {config.model || "default"}</span>
            <span>Score: {config.score_min ?? 0}–{config.score_max ?? 5}</span>
          </div>
          {config.prompt_template && (
            <p className="text-xs text-neutral-400 mt-2 line-clamp-2 font-mono">
              {config.prompt_template.substring(0, 200)}...
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/evaluations/runs?evaluatorId=${evaluator.id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            Run →
          </Link>
          <button onClick={onDelete} className="text-sm text-red-600 hover:text-red-800">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateEvaluatorForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [provider, setProvider] = useState("openai");
  const [scoreMin, setScoreMin] = useState("1");
  const [scoreMax, setScoreMax] = useState("5");
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) { setError("Name is required"); return; }
    setLoading(true);
    setError("");
    try {
      await evaluationApi.createEvaluator({
        name,
        evaluator_type: "llm_judge",
        config: {
          model,
          provider,
          score_min: Number(scoreMin),
          score_max: Number(scoreMax),
          temperature: 0.0,
          prompt_template: prompt || undefined,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
      <h3 className="font-medium mb-4">Create LLM Judge Evaluator</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 mb-4">
          {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            placeholder="e.g. Response Quality"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="w-full rounded border border-neutral-300 px-3 py-2 text-sm">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="mock">Mock (demo)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Model</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            placeholder="gpt-4o-mini"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700 mb-1">Score Min</label>
            <input value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} type="number" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700 mb-1">Score Max</label>
            <input value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} type="number" className="w-full rounded border border-neutral-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>
      <div className="mt-4">
        <label className="block text-sm font-medium text-neutral-700 mb-1">Custom Prompt Template (optional)</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm font-mono"
          placeholder="Leave empty to use default judge prompt. Use {trace_name}, {user_id}, {conversation}, {score_min}, {score_max} as placeholders."
        />
      </div>
      <div className="flex justify-end mt-4">
        <button
          type="submit"
          disabled={loading}
          className="bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Evaluator"}
        </button>
      </div>
    </form>
  );
}
