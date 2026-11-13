import { motion } from "framer-motion";
import { AlertCircle, CheckCircle2, FlaskConical, Save, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useStore } from "../lib/store";
import type { Condition, ExplNode, LevelName, Rule, RuleKind, RuleStatus } from "../lib/types";
import ConditionTree from "./ConditionTree";
import { LEVEL_ORDER, LEVEL_SHORT, StatusBadge } from "./ui";

const KINDS: { id: RuleKind; label: string }[] = [
  { id: "triage", label: "Triage (attribue un niveau)" },
  { id: "modifier", label: "Facteur de risque (modifie le niveau)" },
  { id: "derive", label: "Dérivation (produit un fait)" },
  { id: "fallback", label: "Repli (si aucune règle)" },
];

const TEMPLATES: { label: string; snippet: string }[] = [
  { label: "Fait vrai", snippet: '{"fact": "chest_pain"}' },
  { label: "Comparaison", snippet: '{"fact": "temperature", "op": ">=", "value": 38}' },
  { label: "ET", snippet: '{"all": [\n  {"fact": "cough"},\n  {"fact": "fever"}\n]}' },
  { label: "OU", snippet: '{"any": [\n  {"fact": "vomiting"},\n  {"fact": "diarrhea"}\n]}' },
  { label: "NON", snippet: '{"not": {"fact": "fever"}}' },
  { label: "Renseigné", snippet: '{"known": "spo2"}' },
];

export default function RuleEditor({ initial, onClose, onSaved }: { initial: Rule | null; onClose: () => void; onSaved: () => void }) {
  const store = useStore();
  const isNew = !initial;
  const [id, setId] = useState(initial?.id ?? "R-X-01");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [kind, setKind] = useState<RuleKind>(initial?.kind ?? "triage");
  const [category, setCategory] = useState(initial?.category ?? "combination");
  const [level, setLevel] = useState<LevelName>(initial?.level ?? "ROUTINE");
  const [priority, setPriority] = useState(String(initial?.priority ?? 50));
  const [modType, setModType] = useState<"floor" | "escalate">(initial?.modifier?.type ?? "floor");
  const [modLevel, setModLevel] = useState<LevelName>(initial?.modifier?.level ?? "URGENT");
  const [modSteps, setModSteps] = useState(String(initial?.modifier?.steps ?? 1));
  const [modMax, setModMax] = useState<LevelName>(initial?.modifier?.max ?? "URGENT");
  const [target, setTarget] = useState(initial?.target ?? "");
  const [mode, setMode] = useState<"definition" | "implication">(initial?.mode ?? "definition");
  const [condText, setCondText] = useState(JSON.stringify(initial?.condition ?? { all: [{ fact: "cough" }, { fact: "fever" }] }, null, 2));
  const [hypotheses, setHypotheses] = useState((initial?.hypotheses ?? []).join("\n"));
  const [advice, setAdvice] = useState((initial?.advice ?? []).join("\n"));
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [source, setSource] = useState(initial?.source ?? "Démonstration pédagogique");

  const [errors, setErrors] = useState<string[]>([]);
  const [condPreview, setCondPreview] = useState<string | null>(null);
  const [test, setTest] = useState<{ status: RuleStatus; explanation: ExplNode | null; unknown_facts: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [factFilter, setFactFilter] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo<{ cond: Condition | null; error: string | null }>(() => {
    try {
      return { cond: JSON.parse(condText) as Condition, error: null };
    } catch (e) {
      return { cond: null, error: `JSON invalide : ${(e as Error).message}` };
    }
  }, [condText]);

  const rule = useMemo<Rule | null>(() => {
    if (!parsed.cond) return null;
    const r: Rule = {
      id: id.trim(),
      title: title.trim(),
      kind,
      category,
      priority: parseInt(priority, 10) || 0,
      condition: parsed.cond,
      hypotheses: hypotheses.split("\n").map((s) => s.trim()).filter(Boolean),
      advice: advice.split("\n").map((s) => s.trim()).filter(Boolean),
      explanation: explanation.trim(),
      source: source.trim(),
      enabled: initial?.enabled ?? true,
      version: initial?.version,
    };
    if (kind === "triage" || kind === "fallback") r.level = level;
    if (kind === "modifier") r.modifier = modType === "floor" ? { type: "floor", level: modLevel } : { type: "escalate", steps: parseInt(modSteps, 10) || 1, max: modMax };
    if (kind === "derive") {
      r.target = target.trim();
      r.mode = mode;
      r.category = "derivation";
    }
    return r;
  }, [id, title, kind, category, priority, parsed, hypotheses, advice, explanation, source, level, modType, modLevel, modSteps, modMax, target, mode, initial]);

  // Validation en direct par le backend
  useEffect(() => {
    if (!rule) {
      setErrors(parsed.error ? [parsed.error] : []);
      setCondPreview(null);
      return;
    }
    const t = setTimeout(() => {
      api
        .validateRule(rule, isNew)
        .then((v) => {
          setErrors(v.errors);
          setCondPreview(v.condition_text);
        })
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [rule, isNew, parsed.error]);

  const insert = (snippet: string) => {
    const el = textRef.current;
    if (!el) return setCondText(snippet);
    const { selectionStart: s, selectionEnd: e } = el;
    const next = condText.slice(0, s) + snippet + condText.slice(e);
    setCondText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = s + snippet.length;
    });
  };

  const runTest = async () => {
    if (!rule) return;
    try {
      setTest(await api.testRule(rule, store.facts, store.closedWorld));
    } catch (e) {
      setErrors(e instanceof ApiError && Array.isArray(e.detail) ? (e.detail as string[]) : [String(e)]);
    }
  };

  const save = async () => {
    if (!rule) return;
    setSaving(true);
    try {
      if (isNew) await api.createRule(rule);
      else await api.updateRule(initial!.id, rule);
      onSaved();
    } catch (e) {
      setErrors(e instanceof ApiError && Array.isArray(e.detail) ? (e.detail as string[]) : [String((e as Error).message)]);
    } finally {
      setSaving(false);
    }
  };

  const allFacts = [
    ...store.factMetas.map((f) => ({ id: f.id, label: f.label, derived: false })),
    ...store.derived.map((d) => ({ id: d.id, label: d.label, derived: true })),
  ].filter((f) => !factFilter || f.id.includes(factFilter.toLowerCase()) || f.label.toLowerCase().includes(factFilter.toLowerCase()));

  const field = "flex flex-col gap-1.5";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-navy-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong my-6 w-full max-w-6xl p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="label text-teal">Rule Management Studio</div>
            <h2 className="text-xl font-extrabold text-white">{isNew ? "Nouvelle règle" : `Modifier ${initial!.id}`}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div className="grid grid-cols-[130px_1fr] gap-3">
              <label className={field}>
                <span className="label">Identifiant</span>
                <input className="input mono" value={id} onChange={(e) => setId(e.target.value)} disabled={!isNew} />
              </label>
              <label className={field}>
                <span className="label">Titre</span>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Toux + fièvre chez le fumeur" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className={field}>
                <span className="label">Type</span>
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
                  {KINDS.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </label>
              <label className={field}>
                <span className="label">Catégorie</span>
                <select className="input" value={kind === "derive" ? "derivation" : category} onChange={(e) => setCategory(e.target.value)} disabled={kind === "derive"}>
                  {Object.entries(store.meta?.categories ?? {}).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(kind === "triage" || kind === "fallback") && (
                <label className={`${field} col-span-2`}>
                  <span className="label">Niveau conclu</span>
                  <select className="input" value={level} onChange={(e) => setLevel(e.target.value as LevelName)}>
                    {LEVEL_ORDER.map((l) => <option key={l} value={l}>{LEVEL_SHORT[l]}</option>)}
                  </select>
                </label>
              )}
              {kind === "modifier" && (
                <>
                  <label className={field}>
                    <span className="label">Effet</span>
                    <select className="input" value={modType} onChange={(e) => setModType(e.target.value as "floor" | "escalate")}>
                      <option value="floor">Plancher</option>
                      <option value="escalate">Escalade</option>
                    </select>
                  </label>
                  {modType === "floor" ? (
                    <label className={field}>
                      <span className="label">Niveau min.</span>
                      <select className="input" value={modLevel} onChange={(e) => setModLevel(e.target.value as LevelName)}>
                        {LEVEL_ORDER.map((l) => <option key={l} value={l}>{LEVEL_SHORT[l]}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className={field}>
                        <span className="label">+ crans</span>
                        <input className="input" value={modSteps} onChange={(e) => setModSteps(e.target.value)} />
                      </label>
                      <label className={field}>
                        <span className="label">Max</span>
                        <select className="input px-1" value={modMax} onChange={(e) => setModMax(e.target.value as LevelName)}>
                          {LEVEL_ORDER.map((l) => <option key={l} value={l}>{LEVEL_SHORT[l]}</option>)}
                        </select>
                      </label>
                    </div>
                  )}
                </>
              )}
              {kind === "derive" && (
                <>
                  <label className={field}>
                    <span className="label">Fait produit</span>
                    <input className="input mono" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="ex. fever" />
                  </label>
                  <label className={field}>
                    <span className="label">Mode</span>
                    <select className="input" value={mode} onChange={(e) => setMode(e.target.value as "definition" | "implication")}>
                      <option value="definition">Définition (vrai/faux)</option>
                      <option value="implication">Implication (vrai seul.)</option>
                    </select>
                  </label>
                </>
              )}
              <label className={field}>
                <span className="label">Priorité</span>
                <input className="input" value={priority} onChange={(e) => setPriority(e.target.value)} />
              </label>
            </div>

            <div className={field}>
              <div className="flex items-center justify-between">
                <span className="label">Condition (JSON)</span>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATES.map((t) => (
                    <button key={t.label} className="chip border-white/10 bg-white/5 text-slate-300 hover:border-teal/40" onClick={() => insert(t.snippet)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                ref={textRef}
                className="input mono h-48 resize-y leading-relaxed"
                spellCheck={false}
                value={condText}
                onChange={(e) => setCondText(e.target.value)}
              />
              {condPreview && <div className="mono rounded-lg bg-teal/[0.06] px-3 py-2 text-teal">SI {condPreview}</div>}
            </div>

            <div className="rounded-xl border border-white/5 bg-navy-950/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="label">Faits disponibles</span>
                <input className="input w-36 py-1 text-xs" placeholder="filtrer" value={factFilter} onChange={(e) => setFactFilter(e.target.value)} />
              </div>
              <div className="scrollbar-thin flex max-h-28 flex-wrap gap-1 overflow-auto">
                {allFacts.map((f) => (
                  <button
                    key={f.id}
                    title={f.label}
                    onClick={() => insert(`{"fact": "${f.id}"}`)}
                    className={`mono rounded-md border px-1.5 py-0.5 text-[11px] ${f.derived ? "border-electric/30 text-electric" : "border-white/10 text-slate-300"} hover:bg-white/5`}
                  >
                    {f.id}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {kind !== "derive" && (
              <div className="grid grid-cols-2 gap-3">
                <label className={field}>
                  <span className="label">Hypothèses (1 par ligne)</span>
                  <textarea className="input h-24" value={hypotheses} onChange={(e) => setHypotheses(e.target.value)} />
                </label>
                <label className={field}>
                  <span className="label">Conseils (1 par ligne)</span>
                  <textarea className="input h-24" value={advice} onChange={(e) => setAdvice(e.target.value)} />
                </label>
              </div>
            )}
            <label className={field}>
              <span className="label">Explication (affichée à l'utilisateur)</span>
              <textarea className="input h-20" value={explanation} onChange={(e) => setExplanation(e.target.value)} />
            </label>
            <label className={field}>
              <span className="label">Source / validation</span>
              <input className="input" value={source} onChange={(e) => setSource(e.target.value)} />
            </label>

            <div className={`rounded-xl border p-3 ${errors.length ? "border-red-500/30 bg-red-500/[0.06]" : "border-teal/25 bg-teal/[0.05]"}`}>
              {errors.length ? (
                <ul className="space-y-1 text-xs text-red-200">
                  {errors.map((e) => (
                    <li key={e} className="flex gap-2">
                      <AlertCircle size={13} className="mt-px shrink-0" />
                      {e}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex items-center gap-2 text-xs text-teal">
                  <CheckCircle2 size={14} /> Règle valide (structure, faits et niveaux vérifiés par le moteur)
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/5 bg-navy-950/40 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="label">Tester sur le cas courant</div>
                  <div className="text-xs text-slate-500">{store.caseName} · {Object.keys(store.facts).length} fait(s)</div>
                </div>
                <button className="btn-ghost" onClick={runTest} disabled={!rule}>
                  <FlaskConical size={15} /> Tester
                </button>
              </div>
              {test && (
                <div className="mt-3 space-y-2">
                  <StatusBadge status={test.status} />
                  {test.explanation && <ConditionTree node={test.explanation} labels={store.labels} />}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-ghost" onClick={onClose}>
                Annuler
              </button>
              <button className="btn-primary" onClick={save} disabled={!rule || errors.length > 0 || saving}>
                <Save size={15} /> {isNew ? "Créer la règle" : "Enregistrer (nouvelle version)"}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
