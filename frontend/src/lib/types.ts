export type LevelName = "SELF_CARE" | "ROUTINE" | "URGENT" | "EMERGENCY";
export type FactValue = boolean | number;
export type Facts = Record<string, FactValue>;
export type RuleStatus = "fired" | "not_fired" | "undetermined" | "superseded" | "disabled";
export type RuleKind = "triage" | "derive" | "modifier" | "fallback";

export interface LevelInfo {
  value: number;
  label: string;
  short: string;
  color: string;
  explanation: string;
}

export interface Region {
  id: string;
  label: string;
  description: string;
}

export interface FactMeta {
  id: string;
  label: string;
  type: "bool" | "number";
  unit?: string;
  min?: number;
  max?: number;
  group: "context" | "vitals" | "symptom";
  region: string;
  question: string;
}

export interface DerivedFactMeta {
  id: string;
  label: string;
  rule: string;
  mode: string;
}

export interface Meta {
  app: string;
  kb_version: string;
  updated_at: string;
  disclaimer: string;
  levels: Record<LevelName, LevelInfo>;
  categories: Record<string, string>;
  regions: Region[];
}

export interface ExplNode {
  type: "all" | "any" | "not" | "leaf" | "known";
  result: boolean | null;
  fact?: string;
  op?: string;
  value?: unknown;
  actual?: unknown;
  children?: ExplNode[];
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { known: string }
  | { fact: string; op?: string; value?: unknown };

export interface Modifier {
  type: "floor" | "escalate";
  level?: LevelName;
  steps?: number;
  max?: LevelName;
}

export interface Rule {
  id: string;
  title: string;
  kind: RuleKind;
  category: string;
  level?: LevelName;
  priority: number;
  condition: Condition;
  hypotheses?: string[];
  advice?: string[];
  explanation?: string;
  source?: string;
  version?: string;
  enabled?: boolean;
  target?: string;
  mode?: "definition" | "implication";
  modifier?: Modifier;
  condition_text?: string;
  regions?: string[];
  facts?: string[];
}

export interface RuleEval {
  id: string;
  title: string;
  kind: RuleKind;
  category: string;
  level: LevelName | null;
  priority: number;
  status: RuleStatus;
  result: boolean | null;
  explanation: ExplNode | null;
  unknown_facts: string[];
  evidence?: number;
  condition_text: string;
  regions: string[];
  why: string;
  hypotheses: string[];
  advice: string[];
  modifier: Modifier | null;
  target: string | null;
  source: string;
  version: string;
}

export interface TraceStep {
  step: number;
  phase: string;
  message: string;
  rule_id?: string;
  level?: LevelName;
  fact?: string;
  severity?: string;
  iteration?: number;
}

export interface MissingQuestion {
  fact: string;
  label: string;
  question: string;
  type: "bool" | "number";
  unit?: string;
  region: string;
  group: string;
  impact_level: LevelName;
  rules: string[];
  score: number;
}

export interface InferResult {
  kb_version: string;
  closed_world: boolean;
  level: LevelName | null;
  level_value: number | null;
  label: string;
  explanation: string;
  conclusive: boolean;
  provisional: boolean;
  decisive_rule: string | null;
  decisive_reason: string | null;
  base_level: LevelName | null;
  hypotheses: string[];
  advice: string[];
  warnings: { severity: string; message: string }[];
  contradictions: { id: string; severity: string; message: string }[];
  conflicts: { rules: string[]; message: string; resolution: string }[];
  derived: { fact: string; value: boolean; rule_id: string; iteration: number }[];
  modifiers: { rule_id: string; effect: LevelName | null; changed: boolean }[];
  missing: MissingQuestion[];
  rules: RuleEval[];
  fired: string[];
  counts: Record<string, number>;
  working_memory: { fact: string; label: string; value: FactValue; source: string; derived: boolean }[];
  trace: TraceStep[];
}

export interface WhatIfResult {
  before: InferResult;
  after: InferResult;
  after_facts: Facts;
  changed_rules: { id: string; title: string; before: RuleStatus; after: RuleStatus }[];
  newly_fired: string[];
  no_longer_fired: string[];
  level_changed: boolean;
  level_delta: number | null;
}

export interface GraphNode {
  id: string;
  type: "fact" | "derived" | "rule" | "level";
  ref: string;
  label: string;
  rank: number;
  order: number;
  column_size: number;
  region?: string | null;
  group?: string;
  kind?: RuleKind;
  category?: string;
  level?: LevelName | null;
  enabled?: boolean;
  color?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: { source: string; target: string }[];
  columns: number;
}

export interface Scenario {
  id: string;
  name: string;
  description?: string;
  facts: Facts;
  closed_world?: boolean;
  expected_level: LevelName | null;
  expected_rules: string[];
}

export interface ScenarioResult {
  id: string;
  name: string;
  description: string;
  expected_level: LevelName | null;
  actual_level: LevelName | null;
  expected_rules: string[];
  missing_rules: string[];
  decisive_rule: string | null;
  provisional: boolean;
  fired: string[];
  passed: boolean;
}

export interface HistoryEntry {
  version: string;
  date: string;
  message: string;
  file: string;
  rules: number;
}

export interface QualityReport {
  kb_version: string;
  updated_at: string;
  total_rules: number;
  enabled_rules: number;
  by_category: { id: string; label: string; count: number }[];
  by_level: { id: LevelName; label: string; color: string; count: number }[];
  by_kind: Record<string, number>;
  scenarios: ScenarioResult[];
  tests_passed: number;
  tests_total: number;
  coverage: {
    fired_counts: Record<string, number>;
    never_fired: { id: string; title: string; kind: string; category: string }[];
    ratio: number;
  };
  conflict_cases: { scenario: string; conflicts: { rules: string[]; message: string }[] }[];
  issues: { rule: string; severity: string; message: string }[];
  history: HistoryEntry[];
}

export interface CaseRecord {
  id: number;
  created_at: string;
  name: string;
  notes: string;
  facts: Facts;
  closed_world: boolean;
  level: LevelName | null;
  label: string;
  decisive_rule: string | null;
  fired: string[];
  kb_version: string;
}

export interface Stats {
  kb_version: string;
  updated_at: string;
  total_rules: number;
  enabled_rules: number;
  by_category: { id: string; label: string; count: number }[];
  by_level: { id: LevelName; label: string; color: string; count: number }[];
  tests_passed: number;
  tests_total: number;
  coverage: number;
  facts: number;
  derived_facts: number;
  cases_total: number;
  cases_by_level: Record<string, number>;
  recent_cases: CaseRecord[];
}
