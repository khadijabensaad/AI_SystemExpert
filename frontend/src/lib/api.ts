import type {
  CaseRecord,
  DerivedFactMeta,
  FactMeta,
  Facts,
  GraphData,
  HistoryEntry,
  InferResult,
  Meta,
  QualityReport,
  Region,
  Rule,
  RuleEval,
  Scenario,
  Stats,
  WhatIfResult,
} from "./types";

export class ApiError extends Error {
  detail: unknown;
  constructor(message: string, detail: unknown) {
    super(message);
    this.detail = detail;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* corps non JSON */
    }
    const message = Array.isArray(detail) ? detail.join(" · ") : String(detail);
    throw new ApiError(message, detail);
  }
  return res.json() as Promise<T>;
}

const post = <T,>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  meta: () => request<Meta>("/meta"),
  facts: () => request<{ regions: Region[]; facts: FactMeta[]; derived: DerivedFactMeta[] }>("/facts"),
  infer: (facts: Facts, closed_world = false) => post<InferResult>("/infer", { facts, closed_world }),
  whatIf: (base_facts: Facts, changes: Record<string, unknown>, closed_world = false) =>
    post<WhatIfResult>("/whatif", { base_facts, changes, closed_world }),

  rules: () => request<Rule[]>("/rules"),
  createRule: (rule: Rule) => post<Rule>("/rules", rule),
  updateRule: (id: string, rule: Rule) => request<Rule>(`/rules/${id}`, { method: "PUT", body: JSON.stringify(rule) }),
  toggleRule: (id: string, enabled: boolean) =>
    request<Rule>(`/rules/${id}/toggle`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
  deleteRule: (id: string) => request<{ deleted: string }>(`/rules/${id}`, { method: "DELETE" }),
  validateRule: (rule: Partial<Rule>, isNew = false) =>
    post<{ valid: boolean; errors: string[]; condition_text: string | null }>(`/rules/validate?is_new=${isNew}`, rule),
  testRule: (rule: Partial<Rule>, facts: Facts, closed_world = false) =>
    post<Pick<RuleEval, "status" | "explanation" | "unknown_facts" | "condition_text">>("/rules/test", {
      rule,
      facts,
      closed_world,
    }),

  graph: () => request<GraphData>("/graph"),
  quality: () => request<QualityReport>("/quality"),
  versions: () => request<HistoryEntry[]>("/versions"),
  restore: (version: string) => post<{ restored: string; kb_version: string }>(`/versions/${version}/restore`, {}),

  scenarios: () => request<Scenario[]>("/scenarios"),
  addScenario: (s: Omit<Scenario, "id" | "expected_level" | "expected_rules"> & Partial<Scenario>) =>
    post<Scenario>("/scenarios", s),

  cases: () => request<CaseRecord[]>("/cases"),
  addCase: (name: string, facts: Facts, closed_world: boolean, notes = "") =>
    post<CaseRecord>("/cases", { name, facts, closed_world, notes }),
  deleteCase: (id: number) => request<{ deleted: number }>(`/cases/${id}`, { method: "DELETE" }),
  stats: () => request<Stats>("/stats"),
};
