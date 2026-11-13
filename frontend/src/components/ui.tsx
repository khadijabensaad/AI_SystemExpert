import { motion } from "framer-motion";
import { AlertOctagon, CheckCircle2, CircleSlash, HelpCircle, Loader2, MinusCircle, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { LevelName, RuleStatus } from "../lib/types";

export const LEVEL_COLORS: Record<LevelName, string> = {
  SELF_CARE: "#22c55e",
  ROUTINE: "#eab308",
  URGENT: "#f97316",
  EMERGENCY: "#ef4444",
};
export const LEVEL_SHORT: Record<LevelName, string> = {
  SELF_CARE: "Auto-soins",
  ROUTINE: "RDV médical",
  URGENT: "Rapide < 48 h",
  EMERGENCY: "Urgence",
};
export const LEVEL_ORDER: LevelName[] = ["SELF_CARE", "ROUTINE", "URGENT", "EMERGENCY"];
export const NEUTRAL = "#64748b";

export function levelColor(level: LevelName | null | undefined): string {
  return level ? LEVEL_COLORS[level] : NEUTRAL;
}

export function Card({ children, className = "", strong = false }: { children: ReactNode; className?: string; strong?: boolean }) {
  return <div className={`${strong ? "glass-strong" : "glass"} p-5 ${className}`}>{children}</div>;
}

export function SectionTitle({ icon, title, subtitle, right }: { icon?: ReactNode; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {icon && <div className="mt-0.5 rounded-lg border border-teal/20 bg-teal/10 p-1.5 text-teal">{icon}</div>}
        <div>
          <h3 className="text-[15px] font-bold text-white">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="label text-teal">{eyebrow}</div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function LevelBadge({ level, size = "sm", label }: { level: LevelName | null | undefined; size?: "sm" | "lg"; label?: string }) {
  const c = levelColor(level);
  const text = label ?? (level ? LEVEL_SHORT[level] : "Indéterminé");
  return (
    <span
      className={`chip ${size === "lg" ? "px-3.5 py-1.5 text-sm" : ""}`}
      style={{ color: c, borderColor: `${c}55`, background: `${c}18` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
      {text}
    </span>
  );
}

const STATUS: Record<RuleStatus, { label: string; color: string; icon: ReactNode }> = {
  fired: { label: "Déclenchée", color: "#00D1C1", icon: <CheckCircle2 size={13} /> },
  not_fired: { label: "Non déclenchée", color: "#64748b", icon: <XCircle size={13} /> },
  undetermined: { label: "Indéterminée", color: "#a78bfa", icon: <HelpCircle size={13} /> },
  superseded: { label: "Supplantée", color: "#94a3b8", icon: <MinusCircle size={13} /> },
  disabled: { label: "Désactivée", color: "#475569", icon: <CircleSlash size={13} /> },
};

export function StatusBadge({ status }: { status: RuleStatus }) {
  const s = STATUS[status];
  return (
    <span className="chip" style={{ color: s.color, borderColor: `${s.color}44`, background: `${s.color}14` }}>
      {s.icon}
      {s.label}
    </span>
  );
}

export function TriIcon({ value, size = 14 }: { value: boolean | null | undefined; size?: number }) {
  if (value === true) return <CheckCircle2 size={size} className="shrink-0 text-teal" />;
  if (value === false) return <XCircle size={size} className="shrink-0 text-slate-500" />;
  return <HelpCircle size={size} className="shrink-0 text-violet-400" />;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 select-none" title={hint}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition ${
          checked ? "border-teal/60 bg-teal/30" : "border-white/15 bg-white/5"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${checked ? "left-[18px] bg-teal shadow-glow" : "left-0.5 bg-slate-400"}`}
        />
      </button>
      {label && <span className="text-sm text-slate-300">{label}</span>}
    </label>
  );
}

/** Réponse oui / non / inconnu — l'inconnu est une vraie valeur pour le moteur. */
export function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean | null) => void }) {
  const opt = (v: boolean | null, text: string, active: boolean, color: string) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      className={`px-2.5 py-1 text-xs font-semibold transition ${active ? "" : "text-slate-400 hover:text-slate-200"}`}
      style={active ? { background: `${color}26`, color } : undefined}
    >
      {text}
    </button>
  );
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-navy-950/60">
      {opt(true, "Oui", value === true, "#00D1C1")}
      {opt(false, "Non", value === false, "#94a3b8")}
      {opt(null, "?", value === undefined, "#a78bfa")}
    </div>
  );
}

export function Stat({ label, value, sub, icon, accent = "#00D1C1" }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass relative overflow-hidden p-4">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl" style={{ background: `${accent}30` }} />
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {icon && <span style={{ color: accent }}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-extrabold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
    </motion.div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-navy-950/50 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`relative inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            value === t.id ? "text-navy-950" : "text-slate-400 hover:text-white"
          }`}
        >
          {value === t.id && <motion.span layoutId={`tab-${tabs.map((x) => x.id).join("")}`} className="absolute inset-0 rounded-lg bg-teal" />}
          <span className="relative flex items-center gap-2">
            {t.icon}
            {t.label}
            {t.count !== undefined && (
              <span className={`rounded-full px-1.5 text-[10px] ${value === t.id ? "bg-navy-950/20" : "bg-white/10"}`}>{t.count}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-6 py-10 text-center">
      {icon && <div className="text-slate-500">{icon}</div>}
      <div className="text-sm font-semibold text-slate-300">{title}</div>
      {children && <div className="max-w-sm text-xs text-slate-500">{children}</div>}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-teal" />;
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] ${compact ? "px-3 py-2" : "px-4 py-3"} text-xs text-amber-200/90`}>
      <AlertOctagon size={15} className="mt-px shrink-0 text-amber-400" />
      <span>
        Outil pédagogique de démonstration : ce n'est pas un diagnostic. Base de règles non validée cliniquement. En cas de signe
        grave ou de doute, appelez le 190 (SAMU) ou consultez un professionnel.
      </span>
    </div>
  );
}
