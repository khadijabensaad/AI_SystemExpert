import { Box, BrainCircuit, Database, LayoutDashboard, Stethoscope, WifiOff } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useStore } from "../lib/store";
import { LevelBadge, Spinner } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/triage", label: "Smart Triage", icon: Stethoscope },
  { to: "/anatomy", label: "Anatomie 3D", icon: Box },
  { to: "/reasoning", label: "Expert Reasoning", icon: BrainCircuit },
  { to: "/knowledge", label: "Knowledge Base", icon: Database },
];

export default function Layout() {
  const { meta, result, caseName, inferring, backendError, facts } = useStore();
  const location = useLocation();
  const hasCase = Object.keys(facts).length > 0;

  return (
    <div className="flex h-full">
      <aside className="sticky top-0 hidden h-screen w-[230px] shrink-0 flex-col border-r border-white/[0.06] bg-navy-950/60 px-3 py-5 backdrop-blur-xl md:flex">
        <div className="mb-8 flex items-center gap-2.5 px-2">
          <div className="relative grid h-9 w-9 place-items-center rounded-xl border border-teal/40 bg-teal/10 shadow-glow">
            <span className="absolute inset-0 animate-ping rounded-xl bg-teal/10" />
            <span className="text-lg font-black text-teal">+</span>
          </div>
          <div>
            <div className="text-[15px] font-extrabold leading-none tracking-tight text-white">MediSphere AI</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Expert Triage</div>
          </div>
        </div>
        <nav className="space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  isActive ? "bg-teal/10 text-white shadow-[inset_2px_0_0_#00D1C1]" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
                }`
              }
            >
              <Icon size={18} className="shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <div className="label">Base de connaissances</div>
            <div className="mono mt-1 text-teal">v{meta?.kb_version ?? "—"}</div>
            <div className="mt-1 text-[11px] leading-snug text-slate-500">Règles de démonstration, non validées cliniquement.</div>
          </div>
          <div className="text-[10px] text-slate-600">Mini-projet Système Expert · ISI</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.06] bg-navy-900/70 px-5 py-3 backdrop-blur-xl">
          <nav className="flex gap-1 md:hidden">
            {NAV.map(({ to, icon: Icon }) => (
              <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `rounded-lg p-2 ${isActive ? "bg-teal/15 text-teal" : "text-slate-400"}`}>
                <Icon size={18} />
              </NavLink>
            ))}
          </nav>
          <div className="hidden min-w-0 items-center gap-2 text-sm md:flex">
            <span className="text-slate-500">Cas courant</span>
            <span className="truncate font-semibold text-white">{caseName}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {inferring && <Spinner size={14} />}
            {hasCase && result && location.pathname !== "/triage" && (
              <LevelBadge level={result.level} label={result.level ? undefined : "Données insuffisantes"} />
            )}
            {hasCase && result?.provisional && <span className="chip border-violet/40 bg-violet/10 text-violet-300">Provisoire</span>}
          </div>
        </header>
        {backendError && (
          <div className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <WifiOff size={18} />
            <span>{backendError}</span>
          </div>
        )}
        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
