import { useMemo, useState } from "react";
import type { GraphData, GraphNode, InferResult } from "../lib/types";
import { levelColor, Toggle } from "./ui";

const COL_W = 215;
const NODE_W = 182;
const ROW_H = 25;
const PAD_TOP = 40;

function nodeColor(n: GraphNode): string {
  if (n.type === "fact") return n.group === "symptom" ? "#00D1C1" : n.group === "vitals" ? "#38BDF8" : "#94a3b8";
  if (n.type === "derived") return "#38BDF8";
  if (n.type === "level") return n.color ?? "#64748b";
  if (n.kind === "modifier") return "#8B5CF6";
  if (n.kind === "derive") return "#64748b";
  return levelColor(n.level);
}

function truncate(s: string, n = 27) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * Graphe de connaissances en couches. Avec un résultat d'inférence, le chemin
 * de raisonnement (faits vrais → règles déclenchées → niveau) s'illumine.
 */
export default function ReasoningGraph({ graph, result, onSelectRule, maxHeight = 640 }: { graph: GraphData; result?: InferResult | null; onSelectRule?: (id: string) => void; maxHeight?: number }) {
  const [activeOnly, setActiveOnly] = useState(!!result);
  const [hover, setHover] = useState<string | null>(null);

  const { active, undetermined } = useMemo(() => {
    const active = new Set<string>();
    const undetermined = new Set<string>();
    if (!result) return { active, undetermined };
    for (const wm of result.working_memory) {
      if (wm.value === true || (typeof wm.value === "number" && !Number.isNaN(wm.value))) active.add(`fact:${wm.fact}`);
    }
    for (const r of result.rules) {
      if (r.status === "fired") active.add(`rule:${r.id}`);
      if (r.status === "undetermined") undetermined.add(`rule:${r.id}`);
    }
    for (const d of result.derived) if (d.value) active.add(`rule:${d.rule_id}`);
    if (result.level) active.add(`level:${result.level}`);
    return { active, undetermined };
  }, [result]);

  const { nodes, pos, height, width, columnTitles } = useMemo(() => {
    const visible = graph.nodes.filter((n) => !activeOnly || !result || active.has(n.id) || n.type === "level");
    const byRank = new Map<number, GraphNode[]>();
    visible.forEach((n) => {
      if (!byRank.has(n.rank)) byRank.set(n.rank, []);
      byRank.get(n.rank)!.push(n);
    });
    const pos = new Map<string, { x: number; y: number }>();
    let maxRows = 0;
    const ranks = [...byRank.keys()].sort((a, b) => a - b);
    ranks.forEach((rank, ci) => {
      const col = byRank.get(rank)!.sort((a, b) => a.order - b.order);
      maxRows = Math.max(maxRows, col.length);
      col.forEach((n, i) => pos.set(n.id, { x: ci * COL_W + 8, y: PAD_TOP + i * ROW_H }));
    });
    // centre verticalement les colonnes courtes
    ranks.forEach((rank) => {
      const col = byRank.get(rank)!;
      const offset = ((maxRows - col.length) * ROW_H) / 2;
      col.forEach((n) => {
        const p = pos.get(n.id)!;
        pos.set(n.id, { x: p.x, y: p.y + offset });
      });
    });
    const last = ranks.length - 1;
    const columnTitles = ranks.map((r, i) =>
      i === 0 ? "Faits saisis" : i === last ? "Niveau de triage" : i === last - 1 ? "Règles de triage / risque" : `Chaînage avant · ${i}`,
    );
    return { nodes: visible, pos, height: PAD_TOP + maxRows * ROW_H + 16, width: ranks.length * COL_W, columnTitles };
  }, [graph, activeOnly, active, result]);

  const neighbours = useMemo(() => {
    if (!hover) return null;
    const s = new Set<string>([hover]);
    graph.edges.forEach((e) => {
      if (e.source === hover) s.add(e.target);
      if (e.target === hover) s.add(e.source);
    });
    return s;
  }, [hover, graph.edges]);

  const edges = graph.edges.filter((e) => pos.has(e.source) && pos.has(e.target));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
        {result && <Toggle checked={activeOnly} onChange={setActiveOnly} label="Chemin actif uniquement" />}
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-teal" /> Symptôme</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-electric" /> Constante / fait dérivé</span>
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-violet" /> Facteur de risque</span>
        {result && <span className="flex items-center gap-1.5"><i className="h-2 w-3 rounded-sm border border-dashed border-violet-400" /> Règle indéterminée</span>}
      </div>
      <div className="scrollbar-thin overflow-auto rounded-xl border border-white/5 bg-navy-950/50" style={{ maxHeight }}>
        <svg width={width} height={height} className="block">
          {columnTitles.map((t, i) => (
            <text key={i} x={i * COL_W + 8} y={20} className="fill-slate-500" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2 }}>
              {t.toUpperCase()}
            </text>
          ))}
          {edges.map((e, i) => {
            const a = pos.get(e.source)!;
            const b = pos.get(e.target)!;
            const x1 = a.x + NODE_W;
            const y1 = a.y + 9;
            const x2 = b.x;
            const y2 = b.y + 9;
            const dx = Math.max(40, Math.abs(x2 - x1) / 2);
            const isActive = active.has(e.source) && active.has(e.target);
            const dim = neighbours ? !(neighbours.has(e.source) && neighbours.has(e.target)) : false;
            return (
              <path
                key={i}
                d={`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`}
                fill="none"
                stroke={isActive ? "#00D1C1" : "#334155"}
                strokeWidth={isActive ? 1.8 : 1}
                strokeOpacity={dim ? 0.06 : isActive ? 0.9 : result ? 0.25 : 0.45}
                className={isActive ? "flow" : ""}
              />
            );
          })}
          {nodes.map((n) => {
            const p = pos.get(n.id)!;
            const c = nodeColor(n);
            const isActive = active.has(n.id);
            const isUndet = undetermined.has(n.id);
            const dim = (neighbours && !neighbours.has(n.id)) || (result && !isActive && !isUndet && n.type !== "level");
            const clickable = n.type === "rule" && onSelectRule;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => clickable && onSelectRule!(n.ref)}
                style={{ cursor: clickable ? "pointer" : "default", opacity: dim ? 0.35 : 1, transition: "opacity .2s" }}
              >
                <title>{n.label}</title>
                <rect
                  width={NODE_W}
                  height={19}
                  rx={9.5}
                  fill={isActive ? `${c}2e` : "#0b1120"}
                  stroke={isUndet ? "#a78bfa" : c}
                  strokeOpacity={isActive ? 1 : 0.45}
                  strokeDasharray={isUndet ? "4 3" : undefined}
                  strokeWidth={isActive ? 1.5 : 1}
                  style={isActive ? { filter: `drop-shadow(0 0 6px ${c})` } : undefined}
                />
                <circle cx={10} cy={9.5} r={3} fill={c} />
                <text x={19} y={13.5} style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500 }} fill={isActive ? "#f8fafc" : "#94a3b8"}>
                  {truncate(n.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
