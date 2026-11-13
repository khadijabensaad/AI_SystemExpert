import { BrainCircuit, Database, FlaskConical, GitBranch, ListTree, Network, PlayCircle, Stethoscope } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ReasoningGraph from "../components/ReasoningGraph";
import ResultPanel from "../components/ResultPanel";
import RuleCard from "../components/RuleCard";
import Simulator from "../components/Simulator";
import TracePlayer from "../components/TracePlayer";
import { formatValue } from "../components/fields";
import { Card, Empty, LevelBadge, PageHeader, Tabs } from "../components/ui";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { GraphData, RuleStatus, Scenario } from "../lib/types";

type Tab = "trace" | "rules" | "memory" | "graph" | "whatif";
type Filter = "fired" | "undetermined" | "not_fired" | "all";

export default function Reasoning() {
  const store = useStore();
  const { result, facts, labels, closedWorld } = store;
  const [tab, setTab] = useState<Tab>("trace");
  const [filter, setFilter] = useState<Filter>("fired");
  const [focusRule, setFocusRule] = useState<string | null>(null);
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const rulesRef = useRef<HTMLDivElement>(null);
  const hasCase = Object.keys(facts).length > 0;

  useEffect(() => {
    api.graph().then(setGraph).catch(() => undefined);
    api.scenarios().then(setScenarios).catch(() => undefined);
  }, [store.kbRevision]);

  const selectRule = (id: string) => {
    setFocusRule(id);
    setFilter("all");
    setTab("rules");
    setTimeout(() => document.getElementById(`rule-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  };

  const rules = useMemo(() => {
    if (!result) return [];
    const order: Record<RuleStatus, number> = { fired: 0, undetermined: 1, superseded: 2, not_fired: 3, disabled: 4 };
    return result.rules
      .filter((r) => r.kind !== "derive")
      .filter((r) => filter === "all" || r.status === filter)
      .sort((a, b) => {
        if (a.id === result.decisive_rule) return -1;
        if (b.id === result.decisive_rule) return 1;
        return order[a.status] - order[b.status] || b.priority - a.priority;
      });
  }, [result, filter]);

  if (!hasCase || !result) {
    return (
      <div>
        <PageHeader eyebrow="Module 04 · Explicabilité" title="Expert Reasoning Room" subtitle="Visualisez pas à pas comment le moteur passe des faits à la conclusion." />
        <Card>
          <Empty icon={<BrainCircuit size={30} />} title="Aucun cas à analyser">
            Saisissez un cas dans Smart Triage ou chargez un scénario pédagogique ci-dessous.
          </Empty>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.slice(0, 12).map((s) => (
              <button
                key={s.id}
                onClick={() => store.loadCase(s.facts, s.closed_world ?? true, `${s.id} · ${s.name}`)}
                className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition hover:border-teal/40 hover:bg-teal/[0.05]"
              >
                <div className="flex items-center gap-2">
                  <span className="mono text-teal">{s.id}</span>
                  <LevelBadge level={s.expected_level} label={s.expected_level ? undefined : "Insuffisant"} />
                </div>
                <div className="mt-1 text-sm font-semibold text-white">{s.name}</div>
                <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{s.description}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 text-center">
            <Link to="/triage" className="btn-primary">
              <Stethoscope size={15} /> Ouvrir Smart Triage
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const wmUser = result.working_memory.filter((w) => !w.derived && w.source === "user");
  const wmAssumed = result.working_memory.filter((w) => w.source === "assumed");

  return (
    <div>
      <PageHeader
        eyebrow="Module 04 · Explicabilité"
        title="Expert Reasoning Room"
        subtitle="Faits utilisés, règles déclenchées ou non et pourquoi, règle déterminante, faits manquants : chaque étape de l'inférence est traçable."
        right={
          <div className="flex gap-2">
            <Link to="/triage" className="btn-ghost">
              <Stethoscope size={15} /> Modifier le cas
            </Link>
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="min-w-0 space-y-4">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "trace", label: "Trace animée", icon: <PlayCircle size={15} />, count: result.trace.length },
              { id: "rules", label: "Règles", icon: <ListTree size={15} />, count: result.rules.filter((r) => r.kind !== "derive").length },
              { id: "memory", label: "Mémoire de travail", icon: <Database size={15} />, count: result.working_memory.length },
              { id: "graph", label: "Graphe", icon: <Network size={15} /> },
              { id: "whatif", label: "What-if", icon: <FlaskConical size={15} /> },
            ]}
          />

          {tab === "trace" && (
            <Card>
              <TracePlayer result={result} onSelectRule={selectRule} />
            </Card>
          )}

          {tab === "rules" && (
            <Card>
              <div className="mb-4 flex flex-wrap items-center gap-2" ref={rulesRef}>
                <Tabs<Filter>
                  value={filter}
                  onChange={setFilter}
                  tabs={[
                    { id: "fired", label: "Déclenchées", count: result.counts.fired },
                    { id: "undetermined", label: "Indéterminées", count: result.counts.undetermined },
                    { id: "not_fired", label: "Non déclenchées", count: result.counts.not_fired },
                    { id: "all", label: "Toutes" },
                  ]}
                />
              </div>
              <div className="space-y-2">
                {rules.map((r) => (
                  <div key={r.id} id={`rule-${r.id}`}>
                    <RuleCard
                      key={`${r.id}-${focusRule === r.id}`}
                      rule={r}
                      labels={labels}
                      decisive={r.id === result.decisive_rule}
                      defaultOpen={focusRule === r.id || (filter === "fired" && r.id === result.decisive_rule)}
                    />
                  </div>
                ))}
                {!rules.length && <Empty title="Aucune règle dans cette catégorie" />}
              </div>
            </Card>
          )}

          {tab === "memory" && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="label mb-3">Faits saisis ({wmUser.length})</div>
                <div className="space-y-1">
                  {wmUser.map((w) => (
                    <div key={w.fact} className="flex justify-between rounded-lg bg-white/[0.02] px-3 py-1.5 text-sm">
                      <span className="text-slate-300">{w.label}</span>
                      <span className="mono text-teal">{formatValue(w.value, store.factById[w.fact]?.unit)}</span>
                    </div>
                  ))}
                </div>
                {wmAssumed.length > 0 && (
                  <>
                    <div className="label mb-2 mt-5">Supposés absents — monde clos ({wmAssumed.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                      {wmAssumed.map((w) => (
                        <span key={w.fact} className="chip border-white/10 bg-white/[0.03] text-slate-500">
                          {w.label}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </Card>
              <Card>
                <div className="label mb-3 flex items-center gap-2">
                  <GitBranch size={13} /> Faits dérivés par chaînage avant ({result.derived.length})
                </div>
                <div className="space-y-1">
                  {result.derived.map((d) => (
                    <button
                      key={d.fact}
                      onClick={() => selectRule(d.rule_id)}
                      className="flex w-full items-center gap-2 rounded-lg bg-white/[0.02] px-3 py-1.5 text-left text-sm hover:bg-white/[0.05]"
                    >
                      <span className="mono w-8 text-slate-600">it.{d.iteration}</span>
                      <span className="flex-1 text-slate-300">{labels[d.fact] ?? d.fact}</span>
                      <span className={`mono ${d.value ? "text-electric" : "text-slate-500"}`}>{d.value ? "vrai" : "faux"}</span>
                      <span className="mono text-slate-500">← {d.rule_id}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Le moteur applique les règles de dérivation jusqu'à ce qu'aucun nouveau fait ne soit produit (point fixe). Un fait dérivé
                  peut lui-même servir à en dériver un autre : c'est le chaînage avant.
                </p>
              </Card>
            </div>
          )}

          {tab === "graph" && graph && (
            <Card>
              <ReasoningGraph graph={graph} result={result} onSelectRule={selectRule} />
              <p className="mt-3 text-xs text-slate-500">Cliquez une règle pour ouvrir son explication. Survolez un nœud pour isoler ses liens.</p>
            </Card>
          )}

          {tab === "whatif" && (
            <Card>
              <Simulator baseFacts={facts} closedWorld={closedWorld} onApply={(f) => store.setFacts(f)} />
            </Card>
          )}
        </div>

        <div className="h-fit xl:sticky xl:top-20">
          <Card strong>
            <ResultPanel result={result} showLink={false} />
          </Card>
        </div>
      </div>
    </div>
  );
}
