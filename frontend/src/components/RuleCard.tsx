import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Crown, TrendingUp } from "lucide-react";
import { useState } from "react";
import type { RuleEval } from "../lib/types";
import ConditionTree from "./ConditionTree";
import { LevelBadge, LEVEL_SHORT, StatusBadge } from "./ui";

export function modifierText(r: Pick<RuleEval, "modifier">): string {
  const m = r.modifier;
  if (!m) return "";
  if (m.type === "floor") return `Niveau minimum : ${m.level ? LEVEL_SHORT[m.level] : "?"}`;
  return `+${m.steps ?? 1} niveau (max ${m.max ? LEVEL_SHORT[m.max] : "?"})`;
}

export default function RuleCard({ rule, labels, decisive = false, defaultOpen = false }: { rule: RuleEval; labels: Record<string, string>; decisive?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-xl border transition ${
        decisive ? "border-teal/50 bg-teal/[0.06] shadow-glow" : "border-white/[0.07] bg-white/[0.02] hover:border-white/15"
      }`}
    >
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="mono shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-slate-300">{rule.id}</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{rule.title}</span>
        {decisive && (
          <span className="chip border-teal/40 bg-teal/15 text-teal">
            <Crown size={12} /> Déterminante
          </span>
        )}
        {rule.kind === "modifier" ? (
          <span className="chip border-violet/40 bg-violet/10 text-violet-300">
            <TrendingUp size={12} /> {modifierText(rule)}
          </span>
        ) : rule.level ? (
          <LevelBadge level={rule.level} />
        ) : null}
        <StatusBadge status={rule.status} />
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-3 border-t border-white/5 px-3.5 py-3">
              <div className="mono rounded-lg bg-navy-950/70 px-3 py-2 text-teal/90">SI {rule.condition_text}</div>
              {rule.explanation && (
                <div className="rounded-lg border border-white/5 bg-navy-950/40 p-3">
                  <ConditionTree node={rule.explanation} labels={labels} />
                </div>
              )}
              {rule.status === "undetermined" && rule.unknown_facts.length > 0 && (
                <div className="text-xs text-violet-300">
                  Indéterminée faute de : {rule.unknown_facts.map((f) => labels[f] ?? f).join(", ")}
                </div>
              )}
              {rule.status === "superseded" && (
                <div className="text-xs text-slate-400">Règle de repli ignorée : une règle de triage spécifique s'applique déjà.</div>
              )}
              <p className="text-xs leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-300">Justification : </span>
                {rule.why}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span>Catégorie : {rule.category}</span>
                <span>Priorité : {rule.priority}</span>
                <span>Version : {rule.version}</span>
                <span>Source : {rule.source}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
