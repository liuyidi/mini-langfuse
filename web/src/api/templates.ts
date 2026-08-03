// Evaluator Templates API client (M17)
import { getProjectAuthHeader } from "../lib/projectAuth";

async function templateReq<T>(path: string): Promise<T> {
  const r = await fetch(path, {
    headers: {
      Authorization: getProjectAuthHeader(),
      "Content-Type": "application/json",
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}: ${await r.text()}`);
  return r.json();
}

export type EvaluatorTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  prompt_template: string;
  score_type: string;
  score_min: number;
  score_max: number;
  default_model: string;
  default_provider: string;
  temperature: number;
  variables: string[];
};

export type TemplateListResponse = {
  categories: Record<string, EvaluatorTemplate[]>;
  total: number;
};

export const templatesApi = {
  list: () => templateReq<TemplateListResponse>("/api/public/evaluator-templates"),
  get: (id: string) => templateReq<EvaluatorTemplate>(`/api/public/evaluator-templates/${id}`),
};
