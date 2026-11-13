import { motion } from "framer-motion";
import {
  BookCheck,
  Box,
  BrainCircuit,
  Database,
  FileClock,
  Gauge,
  Layers,
  Stethoscope,
  Trash2,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Body3D from "../components/Body3D";
import { Card, Disclaimer, Empty, LevelBadge, levelColor, LEVEL_ORDER, LEVEL_SHORT, SectionTitle, Stat } from "../components/ui";
import { api } from "../lib/api";
import { regionLevels, useStore } from "../lib/store";
import type { LevelName, Stats } from "../lib/types";

const MODULES = [
  { to: "/triage", icon: Stethoscope, title: "Smart Triage", text: "Saisie guidée par zone du corps, raisonnement en temps réel et questions complémentaires." },
  { to: "/anatomy", icon: Box, title: "Anatomie 3D", text: "Explorez le corps en 3D : chaque zone est reliée à ses symptômes et à ses règles." },
  { to: "/reasoning", icon: BrainCircuit, title: "Expert Reasoning", text: "Trace animée, règles non déclenchées et pourquoi, graphe, analyse what-if." },
  { to: "/knowledge", icon: Database, title: "Knowledge Base", text: "Gérez les règles, simulez, testez la base et suivez ses versions." },
];

export default function Dashboard() {
  const store = useStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const navigate = useNavigate();

  const load = () => api.stats().then(setStats).catch(() => undefined);
  useEffect(() => {
    load();
  }, [store.kbRevision]);

  const regionLabels = useMemo(() => Object.fromEntries(store.regions.map((r) => [r.id, r.label])), [store.regions]);
  const levels = Object.keys(store.facts).length ? regionLevels(store.result) : {};
  const casesMax = stats ? Math.max(1, ...Object.values(stats.cases_by_level)) : 1;
  const catMax = stats ? Math.max(1, ...stats.by_category.map((c) => c.count)) : 1;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="glass relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(600px_300px_at_70%_50%,rgba(0,209,193,0.12),transparent)]" />
        <div className="relative grid items-center gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="p-7 lg:p-10">
            <div className="chip border-teal/30 bg-teal/10 text-teal">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" /> Système expert explicable · v{stats?.kb_version ?? "…"}
            </div>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-white md:text-[40px]">
              MediSphere AI
              <span className="block bg-gradient-to-r from-teal via-electric to-violet bg-clip-text text-transparent">
                Expert Triage & Clinical Reasoning
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
              Base de faits, base de règles en JSON, moteur d'inférence à chaînage avant en logique à trois valeurs, et un module
              d'explication qui montre chaque étape du raisonnement.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/triage" className="btn-primary px-5 py-2.5">
                <Stethoscope size={17} /> Lancer un triage
              </Link>
              <Link to="/reasoning" className="btn-ghost px-5 py-2.5">
                <BrainCircuit size={17} /> Salle de raisonnement
              </Link>
            </div>
            <div className="mt-8 grid max-w-lg grid-cols-3 gap-4 text-center">
              {[
                ["Faits", stats?.facts],
                ["Faits dérivés", stats?.derived_facts],
                ["Règles", stats?.total_rules],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <div className="text-2xl font-extrabold text-white">{(v as number | undefined) ?? "–"}</div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">{l as string}</div>
                </div>
              ))}
            </div>
          </div>
          <Body3D autoRotate interactive={false} levels={levels} labels={regionLabels} className="h-[420px]" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Règles actives" value={stats ? `${stats.enabled_rules}/${stats.total_rules}` : "–"} sub="dans la base de connaissances" icon={<Layers size={18} />} />
        <Stat
          label="Tests de scénarios"
          value={stats ? `${stats.tests_passed}/${stats.tests_total}` : "–"}
          sub={stats && stats.tests_passed === stats.tests_total ? "tous réussis" : "à vérifier"}
          icon={<BookCheck size={18} />}
          accent={stats && stats.tests_passed === stats.tests_total ? "#22c55e" : "#f97316"}
        />
        <Stat label="Couverture des règles" value={stats ? `${Math.round(stats.coverage * 100)} %` : "–"} sub="règles déclenchées par les tests" icon={<Gauge size={18} />} accent="#38BDF8" />
        <Stat label="Cas enregistrés" value={stats?.cases_total ?? "–"} sub="historique pédagogique" icon={<FileClock size={18} />} accent="#8B5CF6" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Cas récents */}
        <Card className="lg:col-span-2">
          <SectionTitle icon={<FileClock size={16} />} title="Cas pédagogiques récents" subtitle="Cliquez un cas pour le rouvrir dans la salle de raisonnement." />
          {stats && stats.recent_cases.length ? (
            <div className="space-y-1.5">
              {stats.recent_cases.map((c) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 hover:border-teal/30"
                >
                  <button
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => {
                      store.loadCase(c.facts, c.closed_world, c.name);
                      navigate("/reasoning");
                    }}
                  >
                    <span className="mono text-slate-500">#{c.id}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{c.name}</span>
                    <span className="mono hidden text-slate-500 sm:inline">{c.decisive_rule ?? "—"}</span>
                    <LevelBadge level={c.level} label={c.level ? undefined : "Insuffisant"} />
                    <span className="hidden text-[11px] text-slate-500 md:inline">{new Date(c.created_at).toLocaleString("fr-FR")}</span>
                  </button>
                  <button
                    className="rounded-md p-1 text-slate-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                    onClick={() => api.deleteCase(c.id).then(load)}
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </motion.div>
              ))}
            </div>
          ) : (
            <Empty icon={<FileClock size={26} />} title="Aucun cas enregistré">
              Évaluez un cas dans Smart Triage puis cliquez sur « Enregistrer ».
            </Empty>
          )}
        </Card>

        {/* Répartition */}
        <Card>
          <SectionTitle icon={<Workflow size={16} />} title="Répartition des cas" subtitle="Par niveau de triage" />
          <div className="space-y-2.5">
            {[...LEVEL_ORDER].reverse().map((l: LevelName) => {
              const n = stats?.cases_by_level[l] ?? 0;
              return (
                <div key={l}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span style={{ color: levelColor(l) }}>{LEVEL_SHORT[l]}</span>
                    <span className="mono text-slate-400">{n}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5">
                    <motion.div
                      className="h-2 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(n / casesMax) * 100}%` }}
                      style={{ background: levelColor(l), boxShadow: `0 0 10px ${levelColor(l)}88` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6">
            <div className="label mb-2">Base de règles par catégorie</div>
            <div className="space-y-2">
              {stats?.by_category.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 truncate text-slate-400">{c.label}</span>
                  <div className="h-1.5 flex-1 rounded-full bg-white/5">
                    <motion.div className="h-1.5 rounded-full bg-gradient-to-r from-teal to-electric" initial={{ width: 0 }} animate={{ width: `${(c.count / catMax) * 100}%` }} />
                  </div>
                  <span className="mono w-5 text-right text-slate-400">{c.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Modules */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map(({ to, icon: Icon, title, text }, i) => (
          <motion.div key={to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <Link to={to} className="glass group block h-full p-5 transition hover:border-teal/30 hover:shadow-glow">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-teal/30 bg-teal/10 text-teal transition group-hover:scale-110">
                <Icon size={20} />
              </div>
              <div className="mt-3 font-bold text-white">{title}</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{text}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      <Disclaimer />
    </div>
  );
}
