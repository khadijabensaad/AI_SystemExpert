import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookCheck,
  CheckCircle2,
  Database,
  FlaskConical,
  GitCommit,
  Network,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ReasoningGraph from "../components/ReasoningGraph";
import RuleEditor from "../components/RuleEditor";
import { modifierText } from "../components/RuleCard";
import Simulator from "../components/Simulator";
import { Card, Empty, LevelBadge, PageHeader, SectionTitle, Spinner, Stat, Tabs, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { Facts, GraphData, QualityReport, Rule, Scenario } from "../lib/types";

type Tab = "rules" | "studio" | "quality" | "graph";

export default function KnowledgeBase() {
  const [tab, setTab] = useState<Tab>("rules");
  return (
    <div>
      <PageHeader
        eyebrow="Module 05 · Base de connaissances"
        title="Knowledge Base & Rule Studio"
        subtitle="Règles externalisées en JSON : création, modification, activation, tests de non-régression, simulation et historique des versions — sans toucher au code Python."
      />
      <div className="mb-5">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "rules", label: "Règles", icon: <Database size={15} /> },
            { id: "studio", label: "Simulation Studio", icon: <FlaskConical size={15} /> },
            { id: "quality", label: "Qualité & tests", icon: <BookCheck size={15} /> },
            { id: "graph", label: "Knowledge Graph", icon: <Network size={15} /> },
          ]}
        />
      </div>
      {tab === "rules" && <RulesTab />}
      {tab === "studio" && <StudioTab />}
      {tab === "quality" && <QualityTab />}
      {tab === "graph" && <GraphTab />}
    </div>
  );
}

/* ------------------------------------------------------------------ Règles */
function RulesTab() {
  const store = useStore();
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [kind, setKind] = useState("all");
  const [editing, setEditing] = useState<Rule | null | "new">(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => api.rules().then(setRules).catch(() => setRules([]));
  useEffect(() => {
    load();
  }, [store.kbRevision]);

  const filtered = useMemo(
    () =>
      (rules ?? []).filter(
        (r) =>
          (cat === "all" || r.category === cat) &&
          (kind === "all" || r.kind === kind) &&
          (!query ||
            `${r.id} ${r.title} ${r.condition_text}`.toLowerCase().includes(query.toLowerCase())),
      ),
    [rules, cat, kind, query],
  );

  const toggle = async (r: Rule) => {
    await api.toggleRule(r.id, !(r.enabled ?? true));
    store.refreshKnowledge();
  };
  const remove = async (id: string) => {
    await api.deleteRule(id);
    setConfirmDelete(null);
    store.refreshKnowledge();
  };

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input w-64 pl-8" placeholder="Rechercher id, titre, condition…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input w-56" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Toutes les catégories</option>
          {Object.entries(store.meta?.categories ?? {}).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select className="input w-44" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">Tous les types</option>
          <option value="triage">Triage</option>
          <option value="modifier">Facteur de risque</option>
          <option value="derive">Dérivation</option>
          <option value="fallback">Repli</option>
        </select>
        <span className="text-xs text-slate-500">{filtered.length} règle(s)</span>
        <button className="btn-primary ml-auto" onClick={() => setEditing("new")}>
          <Plus size={15} /> Nouvelle règle
        </button>
      </div>

      {!rules ? (
        <div className="py-10 text-center"><Spinner /></div>
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2 pl-2">Actif</th>
                <th className="py-2">Règle</th>
                <th className="py-2">Conclusion</th>
                <th className="py-2">Condition</th>
                <th className="py-2 text-center">Prio.</th>
                <th className="py-2 text-center">Vers.</th>
                <th className="py-2 pr-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const enabled = r.enabled ?? true;
                return (
                  <tr key={r.id} className={`border-b border-white/[0.04] align-top transition hover:bg-white/[0.02] ${enabled ? "" : "opacity-45"}`}>
                    <td className="py-2.5 pl-2">
                      <Toggle checked={enabled} onChange={() => toggle(r)} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="mono text-teal">{r.id}</div>
                      <div className="font-semibold text-slate-100">{r.title}</div>
                      <div className="text-[11px] text-slate-500">{store.meta?.categories[r.category] ?? r.category}</div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {r.kind === "modifier" ? (
                        <span className="chip border-violet/40 bg-violet/10 text-violet-300">{modifierText({ modifier: r.modifier ?? null })}</span>
                      ) : r.kind === "derive" ? (
                        <span className="chip border-electric/30 bg-electric/10 text-electric">→ {r.target}</span>
                      ) : (
                        <LevelBadge level={r.level} />
                      )}
                    </td>
                    <td className="mono max-w-md py-2.5 pr-3 text-[11px] leading-relaxed text-slate-400">{r.condition_text}</td>
                    <td className="mono py-2.5 text-center text-slate-400">{r.priority}</td>
                    <td className="mono py-2.5 text-center text-slate-500">{r.version}</td>
                    <td className="py-2.5 pr-2 text-right">
                      <div className="inline-flex gap-1">
                        <button className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-teal" onClick={() => setEditing(r)} title="Modifier">
                          <Pencil size={14} />
                        </button>
                        {confirmDelete === r.id ? (
                          <button className="btn-danger px-2 py-1 text-xs" onClick={() => remove(r.id)}>
                            Confirmer
                          </button>
                        ) : (
                          <button className="rounded-md p-1.5 text-slate-400 hover:bg-white/5 hover:text-red-400" onClick={() => setConfirmDelete(r.id)} title="Supprimer">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RuleEditor
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            store.refreshKnowledge();
          }}
        />
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- Studio */
function StudioTab() {
  const store = useStore();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [baseId, setBaseId] = useState("current");
  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => undefined);
  }, [store.kbRevision]);

  const base = useMemo<{ facts: Facts; cw: boolean; label: string }>(() => {
    if (baseId === "current") return { facts: store.facts, cw: store.closedWorld, label: store.caseName };
    const s = scenarios.find((x) => x.id === baseId);
    return s ? { facts: s.facts, cw: s.closed_world ?? true, label: s.name } : { facts: {}, cw: true, label: "—" };
  }, [baseId, scenarios, store.facts, store.closedWorld, store.caseName]);

  return (
    <Card>
      <SectionTitle
        icon={<FlaskConical size={16} />}
        title="Rule Simulation Studio"
        subtitle="Partez d'un cas, modifiez des faits et observez les règles qui s'activent ou se désactivent. Transformez le résultat en test de non-régression."
        right={
          <select className="input w-72" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
            <option value="current">Cas courant — {store.caseName}</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} — {s.name}
              </option>
            ))}
          </select>
        }
      />
      <Simulator baseFacts={base.facts} closedWorld={base.cw} allowSaveScenario onApply={(f) => store.loadCase(f, base.cw, `${base.label} (modifié)`)} />
    </Card>
  );
}

/* ---------------------------------------------------------------- Qualité */
function QualityTab() {
  const store = useStore();
  const navigate = useNavigate();
  const [q, setQ] = useState<QualityReport | null>(null);
  const [running, setRunning] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const run = () => {
    setRunning(true);
    api
      .quality()
      .then(setQ)
      .finally(() => setRunning(false));
  };
  useEffect(run, [store.kbRevision]);

  if (!q) return <div className="py-10 text-center"><Spinner /></div>;
  const allPass = q.tests_passed === q.tests_total;
  const maxCat = Math.max(1, ...q.by_category.map((c) => c.count));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Règles" value={`${q.enabled_rules}/${q.total_rules}`} sub="actives / total" icon={<Database size={18} />} />
        <Stat label="Tests" value={`${q.tests_passed}/${q.tests_total}`} sub={allPass ? "non-régression OK" : "régressions détectées"} accent={allPass ? "#22c55e" : "#ef4444"} icon={<BookCheck size={18} />} />
        <Stat label="Couverture" value={`${Math.round(q.coverage.ratio * 100)} %`} sub={`${q.coverage.never_fired.length} règle(s) jamais déclenchée(s)`} accent="#38BDF8" icon={<ShieldCheck size={18} />} />
        <Stat label="Version" value={`v${q.kb_version}`} sub={q.updated_at.replace("T", " ")} accent="#8B5CF6" icon={<GitCommit size={18} />} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <SectionTitle
            icon={<BookCheck size={16} />}
            title="Scénarios de test (non-régression)"
            subtitle="Chaque scénario fixe un niveau attendu et les règles qui doivent se déclencher."
            right={
              <button className="btn-ghost" onClick={run} disabled={running}>
                {running ? <Spinner size={14} /> : <Play size={14} />} Relancer
              </button>
            }
          />
          <div className="scrollbar-thin max-h-[560px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-navy-800">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pl-1"></th>
                  <th className="py-2">Scénario</th>
                  <th className="py-2">Attendu</th>
                  <th className="py-2">Obtenu</th>
                  <th className="py-2">Règle dét.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {q.scenarios.map((s) => (
                  <tr key={s.id} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="py-2 pl-1">{s.passed ? <CheckCircle2 size={16} className="text-green-400" /> : <XCircle size={16} className="text-red-400" />}</td>
                    <td className="py-2 pr-2">
                      <span className="mono mr-2 text-slate-500">{s.id}</span>
                      <span className="text-slate-200">{s.name}</span>
                      {s.missing_rules.length > 0 && <div className="text-[11px] text-red-300">Règles attendues manquantes : {s.missing_rules.join(", ")}</div>}
                    </td>
                    <td className="py-2"><LevelBadge level={s.expected_level} label={s.expected_level ? undefined : "Aucun"} /></td>
                    <td className="py-2"><LevelBadge level={s.actual_level} label={s.actual_level ? undefined : "Aucun"} /></td>
                    <td className="mono py-2 text-slate-400">{s.decisive_rule ?? "—"}</td>
                    <td className="py-2 text-right">
                      <button
                        className="rounded-md px-2 py-1 text-xs text-teal hover:bg-teal/10"
                        onClick={async () => {
                          const all = await api.scenarios();
                          const sc = all.find((x) => x.id === s.id);
                          if (sc) {
                            store.loadCase(sc.facts, sc.closed_world ?? true, `${sc.id} · ${sc.name}`);
                            navigate("/reasoning");
                          }
                        }}
                      >
                        Analyser
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="label mb-3">Répartition par catégorie</div>
            <div className="space-y-2">
              {q.by_category.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 truncate text-slate-400">{c.label}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-white/5">
                    <motion.div className="h-1.5 rounded-full bg-gradient-to-r from-teal to-violet" initial={{ width: 0 }} animate={{ width: `${(c.count / maxCat) * 100}%` }} />
                  </div>
                  <span className="mono w-5 text-right text-slate-400">{c.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {q.by_level.map((l) => (
                <LevelBadge key={l.id} level={l.id} label={`${l.label} · ${l.count}`} />
              ))}
            </div>
          </Card>

          <Card>
            <div className="label mb-3">Jamais déclenchées par les tests</div>
            {q.coverage.never_fired.length ? (
              <div className="space-y-1">
                {q.coverage.never_fired.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <AlertTriangle size={13} className="text-amber-400" />
                    <span className="mono text-slate-300">{r.id}</span>
                    <span className="truncate text-slate-400">{r.title}</span>
                  </div>
                ))}
                <p className="pt-2 text-[11px] text-slate-500">Ajoutez un scénario depuis le Simulation Studio pour couvrir ces règles.</p>
              </div>
            ) : (
              <div className="text-xs text-teal">Toutes les règles actives sont couvertes.</div>
            )}
          </Card>

          <Card>
            <div className="label mb-3">Contrôles statiques & conflits</div>
            {q.issues.length === 0 && q.conflict_cases.length === 0 && <div className="text-xs text-teal">Aucun problème détecté.</div>}
            <div className="space-y-1.5">
              {q.issues.map((i, k) => (
                <div key={k} className={`text-xs ${i.severity === "error" ? "text-red-300" : i.severity === "warning" ? "text-amber-300" : "text-slate-400"}`}>
                  <span className="mono mr-1.5">{i.rule}</span>
                  {i.message}
                </div>
              ))}
              {q.conflict_cases.map((c) => (
                <div key={c.scenario} className="text-xs text-sky-300">
                  <span className="mono mr-1.5">{c.scenario}</span>
                  {c.conflicts.length} conflit(s) résolu(s) par précaution ({c.conflicts.map((x) => x.rules.join(" vs ")).join(" ; ")})
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle icon={<GitCommit size={16} />} title="Historique des versions" subtitle="Chaque modification crée une version restaurable de la base de règles." />
        {q.history.length ? (
          <div className="space-y-1">
            {q.history.map((h, i) => (
              <div key={h.version + h.date} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.02]">
                <span className={`h-2 w-2 rounded-full ${i === 0 ? "bg-teal shadow-glow" : "bg-slate-600"}`} />
                <span className="mono w-16 text-teal">v{h.version}</span>
                <span className="flex-1 text-slate-300">{h.message}</span>
                <span className="text-xs text-slate-500">{h.rules} règles</span>
                <span className="mono text-xs text-slate-500">{h.date.replace("T", " ")}</span>
                {i > 0 && (
                  <button
                    className="btn-ghost px-2 py-1 text-xs"
                    disabled={restoring !== null}
                    onClick={async () => {
                      setRestoring(h.version);
                      await api.restore(h.version);
                      setRestoring(null);
                      store.refreshKnowledge();
                    }}
                  >
                    <RotateCcw size={12} /> Restaurer
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Pas encore d'historique" />
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ Graphe */
function GraphTab() {
  const store = useStore();
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    api.graph().then(setGraph).catch(() => undefined);
  }, [store.kbRevision]);
  const hasCase = Object.keys(store.facts).length > 0;
  return (
    <Card>
      <SectionTitle
        icon={<Network size={16} />}
        title="Interactive Knowledge Graph"
        subtitle="Faits → règles de dérivation → faits dérivés → règles de triage → niveaux. Les colonnes suivent la profondeur du chaînage avant."
        right={hasCase ? <Toggle checked={overlay} onChange={setOverlay} label="Superposer le cas courant" /> : undefined}
      />
      {graph ? (
        <ReasoningGraph key={String(overlay)} graph={graph} result={overlay ? store.result : null} maxHeight={760} />
      ) : (
        <div className="py-10 text-center"><Spinner /></div>
      )}
    </Card>
  );
}
