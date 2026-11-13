import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "./api";
import type { DerivedFactMeta, FactMeta, Facts, FactValue, InferResult, LevelName, Meta, Region } from "./types";

interface Store {
  ready: boolean;
  backendError: string | null;
  meta: Meta | null;
  regions: Region[];
  factMetas: FactMeta[];
  factById: Record<string, FactMeta>;
  derived: DerivedFactMeta[];
  labels: Record<string, string>;

  facts: Facts;
  setFact: (id: string, value: FactValue | null) => void;
  setFacts: (facts: Facts) => void;
  closedWorld: boolean;
  setClosedWorld: (v: boolean) => void;
  caseName: string;
  setCaseName: (v: string) => void;
  loadCase: (facts: Facts, closedWorld: boolean, name?: string) => void;
  resetCase: () => void;

  result: InferResult | null;
  inferring: boolean;
  /** À appeler après une modification de la base de règles pour tout recalculer. */
  refreshKnowledge: () => void;
  kbRevision: number;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [factMetas, setFactMetas] = useState<FactMeta[]>([]);
  const [derived, setDerived] = useState<DerivedFactMeta[]>([]);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [kbRevision, setKbRevision] = useState(0);

  const [facts, setFactsState] = useState<Facts>({});
  const [closedWorld, setClosedWorld] = useState(false);
  const [caseName, setCaseName] = useState("Nouveau cas");
  const [result, setResult] = useState<InferResult | null>(null);
  const [inferring, setInferring] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    Promise.all([api.meta(), api.facts()])
      .then(([m, f]) => {
        setMeta(m);
        setRegions(f.regions);
        setFactMetas(f.facts);
        setDerived(f.derived);
        setBackendError(null);
      })
      .catch(() =>
        setBackendError("Impossible de joindre l'API. Lancez le backend : uvicorn app.main:app --reload --port 8000"),
      );
  }, [kbRevision]);

  // Inférence en temps réel (anti-rebond 150 ms)
  useEffect(() => {
    if (!meta) return;
    const id = ++reqId.current;
    setInferring(true);
    const t = setTimeout(() => {
      api
        .infer(facts, closedWorld)
        .then((r) => {
          if (id === reqId.current) setResult(r);
        })
        .catch(() => undefined)
        .finally(() => {
          if (id === reqId.current) setInferring(false);
        });
    }, 150);
    return () => clearTimeout(t);
  }, [facts, closedWorld, meta, kbRevision]);

  const setFact = useCallback((id: string, value: FactValue | null) => {
    setFactsState((prev) => {
      const next = { ...prev };
      if (value === null || (typeof value === "number" && Number.isNaN(value))) delete next[id];
      else next[id] = value;
      return next;
    });
  }, []);

  const loadCase = useCallback((f: Facts, cw: boolean, name?: string) => {
    setFactsState({ ...f });
    setClosedWorld(cw);
    if (name) setCaseName(name);
  }, []);

  const resetCase = useCallback(() => {
    setFactsState({});
    setCaseName("Nouveau cas");
  }, []);

  const value = useMemo<Store>(() => {
    const factById = Object.fromEntries(factMetas.map((f) => [f.id, f]));
    const labels: Record<string, string> = {};
    factMetas.forEach((f) => (labels[f.id] = f.label));
    derived.forEach((d) => (labels[d.id] = d.label));
    return {
      ready: !!meta,
      backendError,
      meta,
      regions,
      factMetas,
      factById,
      derived,
      labels,
      facts,
      setFact,
      setFacts: setFactsState,
      closedWorld,
      setClosedWorld,
      caseName,
      setCaseName,
      loadCase,
      resetCase,
      result,
      inferring,
      refreshKnowledge: () => setKbRevision((r) => r + 1),
      kbRevision,
    };
  }, [meta, backendError, regions, factMetas, derived, facts, setFact, closedWorld, caseName, loadCase, resetCase, result, inferring, kbRevision]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore doit être utilisé dans <StoreProvider>");
  return s;
}

/** Niveau le plus grave déclenché par région du corps (pour colorer la 3D). */
export function regionLevels(result: InferResult | null): Record<string, LevelName> {
  const out: Record<string, LevelName> = {};
  if (!result) return out;
  const order: LevelName[] = ["SELF_CARE", "ROUTINE", "URGENT", "EMERGENCY"];
  for (const r of result.rules) {
    if (r.status !== "fired" || !r.level || r.kind === "derive") continue;
    for (const reg of r.regions) {
      if (!out[reg] || order.indexOf(r.level) > order.indexOf(out[reg])) out[reg] = r.level;
    }
  }
  return out;
}
