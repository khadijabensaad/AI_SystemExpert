import { AnimatePresence, motion } from "framer-motion";
import { Activity, CircleSlash, FolderOpen, HelpCircle, RotateCcw, Save, Sparkles, Stethoscope, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Body3D from "../components/Body3D";
import { FactControl } from "../components/fields";
import ResultPanel from "../components/ResultPanel";
import { Card, Disclaimer, Empty, LevelBadge, PageHeader, SectionTitle, Toggle } from "../components/ui";
import { api } from "../lib/api";
import { regionLevels, useStore } from "../lib/store";
import type { FactMeta, Scenario } from "../lib/types";

export default function SmartTriage() {
  const store = useStore();
  const { factMetas, regions, facts, setFact, result, closedWorld, setClosedWorld } = store;
  const [params] = useSearchParams();
  const [region, setRegion] = useState<string>(params.get("region") ?? "chest");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api.scenarios().then(setScenarios).catch(() => undefined);
  }, [store.kbRevision]);

  const regionLabels = useMemo(() => Object.fromEntries(regions.map((r) => [r.id, r.label])), [regions]);
  const context = factMetas.filter((f) => f.group === "context");
  const vitals = factMetas.filter((f) => f.group === "vitals");
  const symptoms = factMetas.filter((f) => f.group === "symptom" && f.region === region);
  const yesCount = (rid: string) => factMetas.filter((f) => f.group === "symptom" && f.region === rid && facts[f.id] === true).length;
  const levels = regionLevels(result);
  const hasInput = Object.keys(facts).length > 0;

  const markRegionNo = () => symptoms.forEach((f) => facts[f.id] === undefined && setFact(f.id, false));

  const saveCase = async () => {
    const c = await api.addCase(store.caseName, facts, closedWorld);
    setSaved(`Cas n°${c.id} enregistré`);
    setTimeout(() => setSaved(null), 2500);
  };

  const row = (f: FactMeta) => (
    <div key={f.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-200">{f.label}</div>
        <div className="truncate text-[11px] text-slate-500">{f.question}</div>
      </div>
      <FactControl meta={f} value={facts[f.id]} onChange={(v) => setFact(f.id, v)} compact />
    </div>
  );

  return (
    <div>
      <PageHeader
        eyebrow="Module 02 · Saisie guidée"
        title="Smart Triage"
        subtitle="Sélectionnez une région du corps, répondez aux questions : le moteur raisonne en temps réel et vous indique les informations qui manquent."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-48" value={store.caseName} onChange={(e) => store.setCaseName(e.target.value)} />
            <div className="relative">
              <FolderOpen size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                className="input w-56 appearance-none pl-8"
                value=""
                onChange={(e) => {
                  const s = scenarios.find((x) => x.id === e.target.value);
                  if (s) store.loadCase(s.facts, s.closed_world ?? true, `${s.id} · ${s.name}`);
                }}
              >
                <option value="">Charger un scénario…</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} — {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn-ghost" onClick={store.resetCase}>
              <RotateCcw size={15} /> Réinitialiser
            </button>
            <button className="btn-primary" onClick={saveCase} disabled={!hasInput}>
              <Save size={15} /> {saved ?? "Enregistrer"}
            </button>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_380px]">
        {/* --- Corps 3D --- */}
        <Card className="h-fit p-3 xl:sticky xl:top-20">
          <div className="px-2 pt-1">
            <div className="label">Carte corporelle 3D</div>
            <p className="mt-1 text-xs text-slate-500">Cliquez une zone · glissez pour tourner · molette pour zoomer</p>
          </div>
          <Body3D selected={region} onSelect={setRegion} levels={levels} labels={regionLabels} className="h-[430px]" />
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {regions.map((r) => {
              const n = yesCount(r.id);
              const lvl = levels[r.id];
              return (
                <button
                  key={r.id}
                  onClick={() => setRegion(r.id)}
                  className={`chip transition ${region === r.id ? "border-violet/60 bg-violet/20 text-white" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"}`}
                >
                  {lvl && <span className="h-1.5 w-1.5 rounded-full" style={{ background: lvl === "EMERGENCY" ? "#ef4444" : lvl === "URGENT" ? "#f97316" : "#eab308" }} />}
                  {r.label}
                  {n > 0 && <span className="rounded-full bg-teal/25 px-1.5 text-[10px] text-teal">{n}</span>}
                </button>
              );
            })}
          </div>
        </Card>

        {/* --- Questionnaire --- */}
        <div className="min-w-0 space-y-5">
          <Card>
            <SectionTitle
              icon={<Stethoscope size={16} />}
              title={`Symptômes · ${regionLabels[region] ?? region}`}
              subtitle={regions.find((r) => r.id === region)?.description}
              right={
                <button className="btn-ghost py-1.5 text-xs" onClick={markRegionNo} title="Les symptômes non renseignés de cette région passent à « non »">
                  <CircleSlash size={13} /> Reste à « non »
                </button>
              }
            />
            <AnimatePresence mode="wait">
              <motion.div key={region} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-0.5">
                {symptoms.length ? symptoms.map(row) : <Empty title="Aucun symptôme spécifique pour cette région" />}
              </motion.div>
            </AnimatePresence>
            <div className="mt-4 rounded-xl border border-white/5 bg-navy-950/40 p-3">
              <Toggle
                checked={closedWorld}
                onChange={setClosedWorld}
                label={
                  <span>
                    <b className="text-slate-100">Hypothèse du monde clos</b> — tout symptôme non renseigné est considéré comme absent.
                    <span className="block text-xs text-slate-500">
                      Désactivée : « ? » reste inconnu et le moteur signale les règles indéterminées (logique à trois valeurs).
                    </span>
                  </span>
                }
              />
            </div>
          </Card>

          <AnimatePresence>
            {result && result.missing.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Card className="border-violet/25">
                  <SectionTitle
                    icon={<Sparkles size={16} />}
                    title="Questions complémentaires du système"
                    subtitle="Classées par utilité : ces réponses peuvent changer le niveau de triage."
                  />
                  <div className="space-y-1">
                    {result.missing.slice(0, 6).map((q) => {
                      const meta = store.factById[q.fact];
                      if (!meta) return null;
                      return (
                        <div key={q.fact} className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <HelpCircle size={15} className="mt-0.5 shrink-0 text-violet-400" />
                            <div className="min-w-0">
                              <div className="text-sm text-slate-100">{q.question}</div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                <span>Peut mener à</span>
                                <LevelBadge level={q.impact_level} />
                                <span className="mono">{q.rules.slice(0, 3).join(", ")}{q.rules.length > 3 ? "…" : ""}</span>
                              </div>
                            </div>
                          </div>
                          <FactControl meta={meta} value={facts[q.fact]} onChange={(v) => setFact(q.fact, v)} compact />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <SectionTitle icon={<Activity size={16} />} title="Signes vitaux" subtitle="Laisser vide si non mesuré : une valeur inconnue n'est jamais inventée." />
              <div className="space-y-0.5">{vitals.map(row)}</div>
            </Card>
            <Card>
              <SectionTitle icon={<User size={16} />} title="Contexte patient" subtitle="Les facteurs de risque modifient le raisonnement." />
              <div className="space-y-0.5">{context.map(row)}</div>
            </Card>
          </div>
        </div>

        {/* --- Résultat --- */}
        <div className="h-fit space-y-4 xl:sticky xl:top-20">
          <Card strong>
            {result && hasInput ? (
              <ResultPanel result={result} />
            ) : (
              <Empty icon={<Stethoscope size={28} />} title="En attente de faits">
                Renseignez au moins un symptôme ou chargez un scénario. Sans symptôme, le système répond « données insuffisantes » plutôt
                qu'une conclusion rassurante.
              </Empty>
            )}
          </Card>
          <Disclaimer compact />
        </div>
      </div>
    </div>
  );
}
