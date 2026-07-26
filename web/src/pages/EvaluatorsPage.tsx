import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { evaluationApi, Evaluator } from "../api/evaluation";
import { templatesApi, EvaluatorTemplate } from "../api/templates";

type CreationStep = "idle" | "select-template" | "configure";

export default function EvaluatorsPage() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<CreationStep>("idle");
  const [selectedTemplate, setSelectedTemplate] = useState<EvaluatorTemplate | null>(null);

  const q = useQuery({
    queryKey: ["evaluators"],
    queryFn: () => evaluationApi.listEvaluators(),
  });

  const templatesQ = useQuery({
    queryKey: ["evaluator-templates"],
    queryFn: () => templatesApi.list(),
    enabled: step === "select-template",
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this evaluator?")) return;
    await evaluationApi.deleteEvaluator(id);
    queryClient.invalidateQueries({ queryKey: ["evaluators"] });
  };

  const handleTemplateSelect = (template: EvaluatorTemplate) => {
    setSelectedTemplate(template);
    setStep("configure");
  };

  const handleCreated = () => {
    setStep("idle");
    setSelectedTemplate(null);
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
          onClick={() => setStep(step === "idle" ? "select-template" : "idle")}
          className="bg-neutral-900 text-white rounded px-4 py-2 text-sm font-medium hover:bg-neutral-800"
        >
          {step !== "idle" ? "Cancel" : "+ New Evaluator"}
        </button>
      </div>

      {/* Step 1: Template Selection */}
      {step === "select-template" && (
        <TemplateGallery
          templates={templatesQ.data}
          isLoading={templatesQ.isLoading}
          onSelect={handleTemplateSelect}
        />
      )}

      {/* Step 2: Configure from template */}
      {step === "configure" && selectedTemplate && (
        <ConfigureEvaluatorForm
          template={selectedTemplate}
          onCreated={handleCreated}
          onBack={() => setStep("select-template")}
        />
      )}

      {/* Existing Evaluators */}
      {step === "idle" && (
        <>
          {q.isLoading && <div className="text-neutral-500">Loading...</div>}

          {q.data && q.data.length === 0 && (
            <div className="bg-white rounded-lg border border-neutral-200 p-10 text-center">
              <p className="text-neutral-500 mb-4">No evaluators yet. Create one to start scoring traces automatically.</p>
              <button
                onClick={() => setStep("select-template")}
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
            <Link to="/evaluations/runs" className="text-blue-600 hover:underline text-sm">
              View all evaluation runs →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// =============================================================================
// Template Gallery
// =============================================================================

function TemplateGallery({
  templates,
  isLoading,
  onSelect,
}: {
  templates?: { categories: Record<string, EvaluatorTemplate[]>; total: number };
  isLoading: boolean;
  onSelect: (t: EvaluatorTemplate) => void;
}) {
  if (isLoading) return <div className="text-neutral-500 p-6">Loading templates...</div>;
  if (!templates) return null;

  const categoryOrder = ["Quality", "Safety", "Relevance", "Custom"];

  return (
    <div className="mb-6">
      <div className="bg-white rounded-lg border border-neutral-200 p-4">
        <h3 className="font-medium mb-1">Choose an Evaluator Template</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Select a template to get started. You can customize everything after selection.
        </p>

        <div className="space-y-6">
          {categoryOrder.map((category) => {
            const items = templates.categories[category];
            if (!items || items.length === 0) return null;
            return (
              <div key={category}>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                  {category}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onSelect(t)}
                      className="text-left bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 hover:border-neutral-300 rounded-lg p-3 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-xl">{t.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{t.name}</div>
                          <div className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
                            {t.description}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">
                              {t.score_type}
                            </span>
                            {t.score_type === "NUMERIC" && (
                              <span className="text-[10px] text-neutral-500">
                                {t.score_min}–{t.score_max}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Configure Evaluator Form (pre-filled from template)
// =============================================================================

function ConfigureEvaluatorForm({
  template,
  onCreated,
  onBack,
}: {
  template: EvaluatorTemplate;
  onCreated: () => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [model, setModel] = useState(template.default_model);
  const [provider, setProvider] = useState(template.default_provider);
  const [scoreMin, setScoreMin] = useState(String(template.score_min));
  const [scoreMax, setScoreMax] = useState(String(template.score_max));
  const [prompt, setPrompt] = useState(template.prompt_template);
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
          temperature: template.temperature,
          prompt_template: prompt,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  };

  // Detect variables used in the prompt
  const usedVars = [...prompt.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const standardVars = ["input", "output", "trace_name", "user_id", "conversation", "score_min", "score_max"];
  const traceVars = usedVars.filter((v) => standardVars.includes(v));
  const customVars = usedVars.filter((v) => !standardVars.includes(v));

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-neutral-200 p-4 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <button type="button" onClick={onBack} className="text-neutral-400 hover:text-neutral-700">←</button>
        <div>
          <h3 className="font-medium">Configure: {template.icon} {template.name}</h3>
          <p className="text-xs text-neutral-500">{template.description}</p>
        </div>
      </div>

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
            <option value="openai">OpenAI-compatible (OpenAI / DeepSeek)</option>
            <option value="anthropic">Anthropic</option>
            <option value="mock">Mock (demo)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 mb-1">Model</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full rounded border border-neutral-300 px-3 py-2 text-sm font-mono"
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
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-neutral-700">Prompt Template</label>
          <span className="text-xs text-neutral-400">Score type: {template.score_type}</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={10}
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm font-mono"
          placeholder="Evaluation prompt..."
        />
      </div>

      {/* Variable mapping info */}
      {(traceVars.length > 0 || customVars.length > 0) && (
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="text-xs font-medium text-blue-700 mb-2">Variable Mapping</div>
          {traceVars.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {traceVars.map((v) => (
                <span key={v} className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono">
                  {v} ← trace data
                </span>
              ))}
            </div>
          )}
          {customVars.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customVars.map((v) => (
                <span key={v} className="text-[11px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-mono">
                  {v} ← custom
                </span>
              ))}
            </div>
          )}
          <div className="text-[10px] text-blue-500 mt-1">
            Variables in {"{braces}"} are auto-filled from trace data at evaluation time.
          </div>
        </div>
      )}

      <div className="flex justify-end mt-4 gap-2">
        <button type="button" onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-700 px-4 py-2">
          Back to templates
        </button>
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

// =============================================================================
// Existing Evaluator Card
// =============================================================================

function EvaluatorCard({ evaluator, onDelete }: { evaluator: Evaluator; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const config = evaluator.config;
  const [running, setRunning] = useState(false);

  const handleStartRun = async () => {
    setRunning(true);
    try {
      await evaluationApi.createRun({ evaluator_id: evaluator.id, limit: 50 });
      queryClient.invalidateQueries({ queryKey: ["evaluation-runs"] });
      window.location.href = `/evaluations/runs?evaluatorId=${evaluator.id}`;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to start run");
      setRunning(false);
    }
  };

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
          <button
            onClick={handleStartRun}
            disabled={running || !evaluator.is_active}
            className="text-sm bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700 disabled:opacity-50"
          >
            {running ? "Starting..." : "Start Run"}
          </button>
          <Link
            to={`/evaluations/runs?evaluatorId=${evaluator.id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            View runs
          </Link>
          <button onClick={onDelete} className="text-sm text-red-600 hover:text-red-800">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
