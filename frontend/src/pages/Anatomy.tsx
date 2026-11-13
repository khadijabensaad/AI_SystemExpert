import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Box, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Body3D from "../components/Body3D";
import { modifierText } from "../components/RuleCard";
import { Card, LevelBadge, LEVEL_ORDER, PageHeader, StatusBadge } from "../components/ui";
import { api } from "../lib/api";
import { regionLevels, useStore } from "../lib/store";
import type { Rule } from "../lib/types";

export default function Anatomy() {
  const store = useStore();
  const { regions, factMetas, facts, result } = store;
  const [region, setRegion] = useState("chest");
  const [rules, setRules] = useState<Rule[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api.rules().then(setRules).catch(() => undefined);
  }, [store.kbRevision]);

  const regionLabels = useMemo(() => Object.fromEntries(regions.map((r) => [r.id, r.label])), [regions]);
  const levels = Object.keys(facts).length ? regionLevels(result) : {};
  const info = regions.find((r) => r.id === region);
  const symptoms = factMetas.filter((f) => f.group === "symptom" && f.region === region);
  const regionRules = rules
    .filter((r) => r.kind !== "derive" && (r.regions ?? []).includes(region))
    .sort((a, b) => LEVEL_ORDER.indexOf(b.level ?? "SELF_CARE") - LEVEL_ORDER.indexOf(a.level ?? "SELF_CARE") || b.priority - a.priority);
  const redFlags = regionRules.filter((r) => r.level === "EMERGENCY").length;
  const statusOf = (id: string) => result?.rules.find((r) => r.id === id)?.status;

  return (
    <div>
      <PageHeader
        eyebrow="Module 03 · Exploration"
        title="Anatomie 3D interactive"
        subtitle="Chaque zone du corps est reliée aux faits et aux règles de la base de connaissances. Les zones concernées par le cas courant s'illuminent selon le niveau d'alerte."
      />
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)_400px]">
        <div className="space-y-2">
          {regions.map((r) => {
            const count = rules.filter((x) => x.kind !== "derive" && (x.regions ?? []).includes(r.id)).length;
            const lvl = levels[r.id];
            return (
              <button
                key={r.id}
                onClick={() => setRegion(r.id)}
                className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                  region === r.id ? "border-violet/50 bg-violet/15 shadow-glow-violet" : "border-white/[0.07] bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{r.label}</span>
                  {lvl && <LevelBadge level={lvl} />}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">{count} règle(s) liée(s)</div>
              </button>
            );
          })}
        </div>

        <Card className="relative overflow-hidden p-0">
          <div className="pointer-events-none absolute left-5 top-4 z-10">
            <div className="label text-teal">Région sélectionnée</div>
            <div className="text-2xl font-extrabold text-white">{info?.label}</div>
            <div className="text-xs text-slate-400">{info?.description}</div>
          </div>
          <div className="pointer-events-none absolute bottom-4 left-5 z-10 flex flex-wrap gap-3 text-[11px] text-slate-400">
            <span>🖱️ Glisser : rotation</span>
            <span>Molette : zoom</span>
            <span>Clic : sélection</span>
          </div>
          <Body3D selected={region} onSelect={setRegion} levels={levels} labels={regionLabels} className="h-[640px]" />
        </Card>

        <AnimatePresence mode="wait">
          <motion.div key={region} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            <Card>
              <div className="flex items-center justify-between">
                <div className="label">Symptômes de la zone</div>
                {redFlags > 0 && (
                  <span className="chip border-red-500/30 bg-red-500/10 text-red-300">
                    <ShieldAlert size={12} /> {redFlags} drapeau(x) rouge(s)
                  </span>
                )}
              </div>
              <div className="mt-3 space-y-1.5">
                {symptoms.length ? (
                  symptoms.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-1.5 text-sm">
                      <span className="text-slate-200">{s.label}</span>
                      <span className={`mono ${facts[s.id] === true ? "text-teal" : facts[s.id] === false ? "text-slate-500" : "text-violet-300"}`}>
                        {facts[s.id] === true ? "oui" : facts[s.id] === false ? "non" : "?"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500">Zone sans symptôme spécifique dans la base (contexte, constantes…).</div>
                )}
              </div>
              <button className="btn-primary mt-4 w-full" onClick={() => navigate(`/triage?region=${region}`)}>
                Évaluer cette zone <ArrowRight size={15} />
              </button>
            </Card>

            <Card>
              <div className="label mb-3">Règles liées à la zone ({regionRules.length})</div>
              <div className="scrollbar-thin max-h-[360px] space-y-2 overflow-auto pr-1">
                {regionRules.map((r) => {
                  const st = statusOf(r.id);
                  return (
                    <div key={r.id} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="mono text-slate-400">{r.id}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{r.title}</span>
                        {r.kind === "modifier" ? (
                          <span className="chip border-violet/40 bg-violet/10 text-violet-300">{modifierText({ modifier: r.modifier ?? null })}</span>
                        ) : (
                          <LevelBadge level={r.level} />
                        )}
                      </div>
                      <div className="mono mt-1.5 text-[11px] text-slate-500">SI {r.condition_text}</div>
                      {st && Object.keys(facts).length > 0 && (
                        <div className="mt-1.5">
                          <StatusBadge status={st} />
                        </div>
                      )}
                    </div>
                  );
                })}
                {!regionRules.length && <div className="text-xs text-slate-500">Aucune règle liée.</div>}
              </div>
            </Card>
            {!Object.keys(facts).length && (
              <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs text-slate-400">
                <Box size={14} /> Chargez un cas pour voir les zones s'illuminer selon les règles déclenchées.
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
