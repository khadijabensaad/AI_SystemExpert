import { motion } from "framer-motion";
import {
  CheckCheck,
  Filter,
  GitBranch,
  GitMerge,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Target,
  TrendingUp,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { InferResult } from "../lib/types";
import { levelColor } from "./ui";

export const PHASES: { id: string; label: string; icon: ReactNode; hint: string }[] = [
  { id: "validation", label: "Validation", icon: <Filter size={15} />, hint: "Types, plages plausibles, monde clos" },
  { id: "coherence", label: "Cohérence", icon: <ShieldCheck size={15} />, hint: "Réponses contradictoires" },
  { id: "derivation", label: "Chaînage avant", icon: <GitBranch size={15} />, hint: "Faits dérivés jusqu'au point fixe" },
  { id: "evaluation", label: "Évaluation", icon: <Workflow size={15} />, hint: "Règles en logique à 3 valeurs" },
  { id: "conflits", label: "Conflits", icon: <GitMerge size={15} />, hint: "Agrégation, principe de précaution" },
  { id: "modificateurs", label: "Facteurs de risque", icon: <TrendingUp size={15} />, hint: "Planchers et escalades" },
  { id: "manquants", label: "Faits manquants", icon: <HelpCircle size={15} />, hint: "Questions utiles" },
  { id: "conclusion", label: "Conclusion", icon: <Target size={15} />, hint: "Niveau final, règle déterminante" },
];

/** Rejoue pas à pas la trace d'inférence du moteur, phase par phase. */
export default function TracePlayer({ result, onSelectRule }: { result: InferResult; onSelectRule?: (id: string) => void }) {
  const total = result.trace.length;
  const [shown, setShown] = useState(total);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setShown(total);
    setPlaying(false);
  }, [result, total]);

  useEffect(() => {
    if (!playing) return;
    if (shown >= total) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setShown((s) => s + 1), 420);
    return () => clearTimeout(t);
  }, [playing, shown, total]);

  const visible = result.trace.slice(0, shown);
  const currentPhase = visible.length ? visible[visible.length - 1].phase : null;
  const phaseCounts = useMemo(() => {
    const c: Record<string, number> = {};
    result.trace.forEach((t) => (c[t.phase] = (c[t.phase] ?? 0) + 1));
    return c;
  }, [result]);
  const reached = new Set(visible.map((t) => t.phase));

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          className="btn-primary"
          onClick={() => {
            if (shown >= total) setShown(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
          {playing ? "Pause" : shown >= total ? "Rejouer le raisonnement" : "Reprendre"}
        </button>
        <button className="btn-ghost" onClick={() => { setPlaying(false); setShown(total); }}>
          <CheckCheck size={15} /> Tout afficher
        </button>
        <button className="btn-ghost" onClick={() => { setPlaying(false); setShown(0); }}>
          <RotateCcw size={15} />
        </button>
        <span className="mono ml-auto text-slate-500">
          étape {shown}/{total}
        </span>
      </div>

      {/* Pipeline */}
      <div className="mb-5 grid grid-cols-4 gap-2 lg:grid-cols-8">
        {PHASES.map((p, i) => {
          const done = reached.has(p.id);
          const current = currentPhase === p.id && playing;
          return (
            <div
              key={p.id}
              title={p.hint}
              className={`relative rounded-xl border px-2.5 py-2 transition ${
                current ? "border-teal bg-teal/15 shadow-glow" : done ? "border-teal/30 bg-teal/[0.06]" : "border-white/5 bg-white/[0.02]"
              }`}
            >
              <div className={`flex items-center gap-1.5 ${done ? "text-teal" : "text-slate-500"}`}>
                {p.icon}
                <span className="mono text-[10px] text-slate-500">{i + 1}</span>
              </div>
              <div className={`mt-1 text-[11px] font-semibold leading-tight ${done ? "text-slate-100" : "text-slate-500"}`}>{p.label}</div>
              <div className="mono mt-0.5 text-[10px] text-slate-500">{phaseCounts[p.id] ?? 0} étape(s)</div>
            </div>
          );
        })}
      </div>

      {/* Journal */}
      <ol className="relative space-y-1.5 border-l border-white/10 pl-5">
        {visible.map((t) => {
          const phase = PHASES.find((p) => p.id === t.phase);
          const color = t.level ? levelColor(t.level) : t.severity === "warning" ? "#f59e0b" : "#00D1C1";
          return (
            <motion.li key={t.step} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="relative">
              <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-navy-900" style={{ background: color }} />
              <div className="flex items-start gap-3 rounded-lg px-2 py-1 hover:bg-white/[0.03]">
                <span className="mono w-7 shrink-0 pt-px text-slate-600">{t.step}</span>
                <span className="w-28 shrink-0 pt-px text-[11px] font-semibold uppercase tracking-wide text-slate-500">{phase?.label ?? t.phase}</span>
                <span className="flex-1 text-[13px] text-slate-200">{t.message}</span>
                {t.rule_id && (
                  <button onClick={() => onSelectRule?.(t.rule_id!)} className="mono shrink-0 rounded bg-white/5 px-1.5 text-teal hover:bg-teal/15">
                    {t.rule_id}
                  </button>
                )}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
