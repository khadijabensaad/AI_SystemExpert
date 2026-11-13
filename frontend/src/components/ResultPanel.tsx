import { motion } from "framer-motion";
import { AlertTriangle, BrainCircuit, Crown, GitMerge, Info, Lightbulb, ListChecks, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import type { InferResult } from "../lib/types";
import { levelColor, LEVEL_ORDER, LEVEL_SHORT } from "./ui";

export function LevelGauge({ result }: { result: InferResult }) {
  return (
    <div className="flex gap-1.5">
      {LEVEL_ORDER.map((l) => {
        const active = result.level === l;
        const c = levelColor(l);
        return (
          <div key={l} className="flex-1">
            <div
              className="h-2 rounded-full transition-all"
              style={{ background: active ? c : `${c}26`, boxShadow: active ? `0 0 14px ${c}` : undefined }}
            />
            <div className={`mt-1 text-center text-[10px] font-semibold ${active ? "" : "text-slate-600"}`} style={active ? { color: c } : undefined}>
              {LEVEL_SHORT[l]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ResultPanel({ result, showLink = true }: { result: InferResult; showLink?: boolean }) {
  const c = levelColor(result.level);
  const decisive = result.rules.find((r) => r.id === result.decisive_rule);
  return (
    <div className="space-y-4">
      <motion.div
        key={result.level ?? "none"}
        initial={{ scale: 0.97, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative overflow-hidden rounded-2xl border p-5"
        style={{ borderColor: `${c}66`, background: `linear-gradient(135deg, ${c}22, transparent 70%)` }}
      >
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl" style={{ background: `${c}40` }} />
        <div className="label" style={{ color: c }}>
          Niveau de triage
        </div>
        <div className="mt-1 text-xl font-extrabold text-white">{result.label}</div>
        <p className="mt-1 text-sm text-slate-300">{result.explanation}</p>
        <div className="mt-4">
          <LevelGauge result={result} />
        </div>
        {result.provisional && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-violet/30 bg-violet/10 px-3 py-2 text-xs text-violet-200">
            <Sparkles size={14} className="mt-px shrink-0" />
            Conclusion provisoire : des informations manquantes pourraient élever le niveau. Répondez aux questions du système.
          </div>
        )}
      </motion.div>

      {decisive && (
        <div className="rounded-xl border border-teal/30 bg-teal/[0.05] p-3.5">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal">
            <Crown size={14} /> Règle déterminante
          </div>
          <div className="mt-1.5 text-sm font-semibold text-white">
            <span className="mono mr-2 text-teal">{decisive.id}</span>
            {decisive.title}
          </div>
          <div className="mono mt-1.5 text-[11px] text-slate-400">SI {decisive.condition_text}</div>
          {result.decisive_reason && <p className="mt-2 text-xs text-slate-400">{result.decisive_reason}</p>}
        </div>
      )}

      {(result.contradictions.length > 0 || result.warnings.length > 0 || result.conflicts.length > 0) && (
        <div className="space-y-2">
          {result.contradictions.map((c) => (
            <div key={c.id} className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-xs text-amber-200">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>
                <b className="mono mr-1">{c.id}</b>
                {c.message}
              </span>
            </div>
          ))}
          {result.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
              <Info size={14} className="mt-px shrink-0" />
              {w.message}
            </div>
          ))}
          {result.conflicts.map((c, i) => (
            <div key={i} className="flex gap-2 rounded-lg border border-electric/25 bg-electric/[0.06] px-3 py-2 text-xs text-sky-200">
              <GitMerge size={14} className="mt-px shrink-0" />
              {c.message}
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Lightbulb size={14} /> Hypothèses générales (non diagnostiques)
        </div>
        <ul className="space-y-1">
          {result.hypotheses.map((h) => (
            <li key={h} className="flex gap-2 text-sm text-slate-200">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-teal" />
              {h}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          <ListChecks size={14} /> Conseils généraux
        </div>
        <ul className="space-y-1">
          {result.advice.map((a) => (
            <li key={a} className="flex gap-2 text-sm text-slate-300">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-violet" />
              {a}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["Déclenchées", result.counts.fired ?? 0, "#00D1C1"],
          ["Indéterminées", result.counts.undetermined ?? 0, "#a78bfa"],
          ["Non décl.", result.counts.not_fired ?? 0, "#64748b"],
          ["Faits dérivés", result.derived.length, "#38BDF8"],
        ].map(([l, v, col]) => (
          <div key={l as string} className="rounded-lg border border-white/5 bg-white/[0.02] py-2">
            <div className="text-lg font-extrabold" style={{ color: col as string }}>
              {v as number}
            </div>
            <div className="text-[10px] text-slate-500">{l as string}</div>
          </div>
        ))}
      </div>

      {showLink && (
        <Link to="/reasoning" className="btn-ghost w-full">
          <BrainCircuit size={16} /> Voir le raisonnement complet
        </Link>
      )}
    </div>
  );
}
