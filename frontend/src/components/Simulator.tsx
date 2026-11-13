import { ArrowDown, ArrowRight, ArrowUp, Check, Equal, FlaskConical, Plus, Search, Undo2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { Facts, FactValue, WhatIfResult } from "../lib/types";
import { FactControl, formatValue } from "./fields";
import { Empty, LevelBadge, levelColor, Spinner, StatusBadge, Tabs } from "./ui";

type Group = "symptom" | "vitals" | "context";

/**
 * Simulation « What-if » : on modifie des faits sur un cas de base et le moteur
 * compare les deux raisonnements (règles activées / désactivées, niveau).
 */
export default function Simulator({
  baseFacts,
  closedWorld,
  onApply,
  allowSaveScenario = false,
}: {
  baseFacts: Facts;
  closedWorld: boolean;
  onApply?: (facts: Facts) => void;
  allowSaveScenario?: boolean;
}) {
  const { factMetas, regions, refreshKnowledge } = useStore();
  const [changes, setChanges] = useState<Record<string, FactValue | null>>({});
  const [group, setGroup] = useState<Group>("symptom");
  const [query, setQuery] = useState("");
  const [res, setRes] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => setChanges({}), [baseFacts]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api
        .whatIf(baseFacts, changes, closedWorld)
        .then(setRes)
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [baseFacts, changes, closedWorld]);

  const regionLabel = useMemo(() => Object.fromEntries(regions.map((r) => [r.id, r.label])), [regions]);
  const visible = factMetas.filter(
    (f) => f.group === group && (!query || f.label.toLowerCase().includes(query.toLowerCase()) || f.id.includes(query.toLowerCase())),
  );

  const effective = (id: string): FactValue | undefined => {
    if (id in changes) return changes[id] ?? undefined;
    return baseFacts[id];
  };

  const setChange = (id: string, v: FactValue | null) => {
    setChanges((prev) => {
      const next = { ...prev };
      const base = baseFacts[id];
      if (v === base || (v === null && base === undefined)) delete next[id];
      else next[id] = v;
      return next;
    });
  };

  const nChanges = Object.keys(changes).length;
  const suggestions = res?.before.missing.slice(0, 5) ?? [];
  const delta = res?.level_delta ?? null;

  const saveScenario = async () => {
    if (!res || !scenarioName.trim()) return;
    const s = await api.addScenario({ name: scenarioName.trim(), description: "Créé depuis le Simulation Studio", facts: res.after_facts, closed_world: closedWorld });
    setSavedMsg(`Scénario ${s.id} ajouté aux tests (niveau attendu : ${s.expected_level ?? "aucun"})`);
    setScenarioName("");
    refreshKnowledge();
    setTimeout(() => setSavedMsg(null), 4000);
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* Édition des faits */}
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Tabs<Group>
            value={group}
            onChange={setGroup}
            tabs={[
              { id: "symptom", label: "Symptômes" },
              { id: "vitals", label: "Constantes" },
              { id: "context", label: "Contexte" },
            ]}
          />
          <div className="relative ml-auto">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input w-44 py-1.5 pl-8" placeholder="Filtrer…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {suggestions.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              <Wand2 size={12} className="mr-1 inline" />
              Et si…
            </span>
            {suggestions.map((q) => (
              <button
                key={q.fact}
                className="chip border-violet/30 bg-violet/10 text-violet-200 hover:bg-violet/20"
                onClick={() => setChange(q.fact, q.type === "bool" ? true : null)}
                disabled={q.type !== "bool"}
                title={q.question}
              >
                <Plus size={11} /> {q.label}
              </button>
            ))}
          </div>
        )}

        <div className="scrollbar-thin max-h-[520px] space-y-0.5 overflow-auto pr-1">
          {visible.map((f) => {
            const changed = f.id in changes;
            return (
              <div key={f.id} className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 ${changed ? "bg-violet/10 ring-1 ring-violet/30" : "hover:bg-white/[0.03]"}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-200">{f.label}</div>
                  <div className="text-[11px] text-slate-500">
                    {group === "symptom" && <span className="mr-2">{regionLabel[f.region]}</span>}
                    base : <span className="mono">{formatValue(baseFacts[f.id], f.unit)}</span>
                    {changed && (
                      <>
                        <ArrowRight size={10} className="mx-1 inline text-violet-300" />
                        <span className="mono text-violet-300">{formatValue(changes[f.id], f.unit)}</span>
                      </>
                    )}
                  </div>
                </div>
                <FactControl meta={f} value={effective(f.id)} onChange={(v) => setChange(f.id, v)} compact />
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparaison */}
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className="text-teal" />
          <span className="text-sm font-bold text-white">Comparaison avant / après</span>
          <span className="chip border-white/10 bg-white/5 text-slate-300">{nChanges} modification(s)</span>
          {loading && <Spinner size={14} />}
          {nChanges > 0 && (
            <button className="btn-ghost ml-auto py-1 text-xs" onClick={() => setChanges({})}>
              <Undo2 size={13} /> Annuler
            </button>
          )}
        </div>

        {res ? (
          <>
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-3">
              {[res.before, res.after].map((r, i) => (
                <div
                  key={i}
                  className="rounded-xl border p-4"
                  style={{ borderColor: `${levelColor(r.level)}55`, background: `linear-gradient(135deg, ${levelColor(r.level)}18, transparent)` }}
                >
                  <div className="label">{i === 0 ? "Avant" : "Après"}</div>
                  <div className="mt-2">
                    <LevelBadge level={r.level} size="lg" label={r.level ? undefined : "Données insuffisantes"} />
                  </div>
                  <div className="mt-2 text-xs text-slate-400">
                    Règle déterminante : <span className="mono text-slate-200">{r.decisive_rule ?? "—"}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {r.fired.length} règle(s) déclenchée(s){r.provisional ? " · provisoire" : ""}
                  </div>
                </div>
              ))}
              <div className="order-2 col-start-2 row-start-1 flex flex-col items-center justify-center">
                <div
                  className="grid h-11 w-11 place-items-center rounded-full border"
                  style={{
                    borderColor: delta && delta > 0 ? "#ef444488" : delta && delta < 0 ? "#22c55e88" : "#ffffff22",
                    color: delta && delta > 0 ? "#f87171" : delta && delta < 0 ? "#4ade80" : "#94a3b8",
                  }}
                >
                  {delta && delta > 0 ? <ArrowUp size={18} /> : delta && delta < 0 ? <ArrowDown size={18} /> : <Equal size={18} />}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">{res.level_changed ? "niveau modifié" : "inchangé"}</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-teal/20 bg-teal/[0.04] p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-teal">Nouvelles règles activées</div>
                {res.newly_fired.length ? (
                  res.newly_fired.map((id) => (
                    <div key={id} className="text-sm text-slate-200">
                      <span className="mono mr-2 text-teal">{id}</span>
                      {res.after.rules.find((r) => r.id === id)?.title ?? res.after.derived.find((d) => d.rule_id === id)?.fact}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500">Aucune</div>
                )}
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Règles désactivées</div>
                {res.no_longer_fired.length ? (
                  res.no_longer_fired.map((id) => (
                    <div key={id} className="text-sm text-slate-400">
                      <span className="mono mr-2">{id}</span>
                      {res.before.rules.find((r) => r.id === id)?.title}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500">Aucune</div>
                )}
              </div>
            </div>

            {res.changed_rules.length > 0 && (
              <div className="rounded-xl border border-white/5">
                <div className="border-b border-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Transitions d'état ({res.changed_rules.length})
                </div>
                <div className="scrollbar-thin max-h-56 overflow-auto">
                  {res.changed_rules.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 border-b border-white/[0.03] px-3 py-1.5 text-xs">
                      <span className="mono w-14 shrink-0 text-slate-300">{r.id}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-400">{r.title}</span>
                      <StatusBadge status={r.before} />
                      <ArrowRight size={12} className="text-slate-500" />
                      <StatusBadge status={r.after} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {onApply && (
                <button className="btn-primary" disabled={!nChanges} onClick={() => onApply(res.after_facts)}>
                  <Check size={15} /> Appliquer au cas courant
                </button>
              )}
              {allowSaveScenario && (
                <>
                  <input className="input w-56" placeholder="Nom du scénario de test" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} />
                  <button className="btn-ghost" disabled={!scenarioName.trim()} onClick={saveScenario}>
                    <Plus size={15} /> Enregistrer comme test
                  </button>
                </>
              )}
            </div>
            {savedMsg && <div className="text-xs text-teal">{savedMsg}</div>}
          </>
        ) : (
          <Empty title="Simulation en cours…" />
        )}
      </div>
    </div>
  );
}
