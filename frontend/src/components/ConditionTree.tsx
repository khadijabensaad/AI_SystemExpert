import type { ExplNode } from "../lib/types";
import { TriIcon } from "./ui";

const OP_TEXT: Record<string, string> = { "==": "=", "!=": "≠", ">": ">", ">=": "≥", "<": "<", "<=": "≤", in: "∈" };

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "inconnu";
  if (v === true) return "oui";
  if (v === false) return "non";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(1);
  return String(v);
}

/** Affiche l'arbre d'évaluation d'une condition, nœud par nœud (vrai / faux / inconnu). */
export default function ConditionTree({ node, labels, depth = 0 }: { node: ExplNode; labels: Record<string, string>; depth?: number }) {
  if (node.type === "leaf" || node.type === "known") {
    const name = labels[node.fact ?? ""] ?? node.fact;
    let text: string;
    if (node.type === "known") text = `${name} renseigné(e)`;
    else if (node.op) text = `${name} ${OP_TEXT[node.op] ?? node.op} ${fmt(node.value)}`;
    else text = name ?? "";
    return (
      <div className="flex items-center gap-2 py-0.5 text-[13px]">
        <TriIcon value={node.result} />
        <span className={node.result === true ? "text-slate-100" : node.result === false ? "text-slate-500" : "text-violet-300"}>{text}</span>
        <span className="mono ml-auto rounded bg-white/5 px-1.5 py-px text-slate-400">valeur : {fmt(node.actual)}</span>
      </div>
    );
  }
  const title = node.type === "all" ? "TOUTES les conditions (ET)" : node.type === "any" ? "AU MOINS UNE condition (OU)" : "NON";
  return (
    <div className={depth > 0 ? "ml-2 border-l border-white/10 pl-3" : ""}>
      <div className="flex items-center gap-2 py-0.5">
        <TriIcon value={node.result} />
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</span>
      </div>
      <div className="ml-1">
        {(node.children ?? []).map((c, i) => (
          <ConditionTree key={i} node={c} labels={labels} depth={depth + 1} />
        ))}
      </div>
    </div>
  );
}
