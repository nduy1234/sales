"use client";

import { BarChart3, Bot, Cpu, Rocket, Menu, PenSquare, RotateCcw, Users, Workflow, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { fmtUsd, totals, useStore } from "@/lib/store";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/autopilot", label: "Autopilot", icon: Rocket, badge: "Agent" },
  { href: "/workflow", label: "Single-lead Workflow", icon: Workflow },
  { href: "/research", label: "Research Agent", icon: Bot, badge: "Cloud" },
  { href: "/prospects", label: "Prospects", icon: Users },
  { href: "/content", label: "Content Studio", icon: PenSquare },
  { href: "/router", label: "Cost Router", icon: Cpu },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { status, usage, brand, reset } = useStore();
  const [open, setOpen] = useState(false);
  const t = totals(usage);

  const nav = (
    <nav className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-sm font-bold text-white shadow-lg shadow-brand-600/30">R</div>
        <div>
          <div className="text-sm font-semibold text-white">RevenuePilot</div>
          <div className="text-[11px] text-slate-400">AI sales & marketing agent</div>
        </div>
      </div>
      <div className="mt-2 space-y-0.5 px-3">
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200")}>
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              {n.badge && <span className="rounded bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-200">{n.badge}</span>}
            </Link>
          );
        })}
      </div>
      <div className="mt-auto space-y-3 p-4">
        <div className="rounded-xl bg-white/5 p-3.5 ring-1 ring-white/10">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">AI spend this session</div>
          <div className="mt-1 font-mono text-lg font-semibold text-white">{fmtUsd(t.spent)}</div>
          <div className="text-[11px] text-emerald-400">{t.calls ? `${t.pct.toFixed(0)}% saved vs all-premium` : "No AI calls yet"}</div>
        </div>
        <div className="text-[11px] text-slate-500">Workspace: <span className="text-slate-300">{brand.name}</span></div>
        <button
          onClick={() => {
            if (confirm("Reset all prospects, content and usage to the sample data?")) reset();
          }}
          className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300"
        >
          <RotateCcw className="h-3 w-3" /> Reset demo data
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-60 bg-slate-950 lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-950">{nav}</aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur sm:px-6">
          <button className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex-1" />
          <ModeBadge live={status?.live} loading={!status} />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function ModeBadge({ live, loading }: { live?: boolean; loading: boolean }) {
  if (loading) return <span className="h-6 w-40 animate-pulse rounded-full bg-slate-100" />;
  return live ? (
    <Link href="/router" className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> TokenRouter key configured · live
    </Link>
  ) : (
    <Link href="/router" className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200" title="Set TOKENROUTER_API_KEY in .env.local for live AI">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Simulated mode · no API key
    </Link>
  );
}
