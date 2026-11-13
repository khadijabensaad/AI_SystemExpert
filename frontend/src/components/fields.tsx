import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FactMeta, FactValue } from "../lib/types";
import { YesNo } from "./ui";

/** Champ numérique tolérant à la saisie (« 38, » ou vide = inconnu). */
export function NumberField({ value, onChange, meta, compact = false }: { value: number | undefined; onChange: (v: number | null) => void; meta: FactMeta; compact?: boolean }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    const parsed = parseFloat(text.replace(",", "."));
    if (value === undefined && text !== "") setText("");
    else if (value !== undefined && parsed !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const out = value !== undefined && ((meta.min !== undefined && value < meta.min) || (meta.max !== undefined && value > meta.max));
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <input
          inputMode="decimal"
          className={`input ${compact ? "w-24 py-1" : "w-28"} pr-10 ${out ? "border-red-500/60" : ""}`}
          placeholder="inconnu"
          value={text}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            if (t.trim() === "") return onChange(null);
            const n = parseFloat(t.replace(",", "."));
            if (!Number.isNaN(n)) onChange(n);
          }}
        />
        {meta.unit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">{meta.unit}</span>}
      </div>
      {value !== undefined && (
        <button className="rounded-md p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200" title="Marquer comme inconnu" onClick={() => onChange(null)}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function FactControl({ meta, value, onChange, compact = false }: { meta: FactMeta; value: FactValue | undefined; onChange: (v: FactValue | null) => void; compact?: boolean }) {
  if (meta.type === "number") {
    return <NumberField meta={meta} value={typeof value === "number" ? value : undefined} onChange={onChange} compact={compact} />;
  }
  return <YesNo value={typeof value === "boolean" ? value : undefined} onChange={onChange} />;
}

export function formatValue(v: FactValue | undefined | null, unit?: string): string {
  if (v === undefined || v === null) return "inconnu";
  if (typeof v === "boolean") return v ? "oui" : "non";
  return `${Number.isInteger(v) ? v : v.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}
