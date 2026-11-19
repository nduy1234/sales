"use client";

import { AlertTriangle, CheckCircle2, Copy, Database, Loader2, Sparkles, Zap } from "lucide-react";
import { useState, type ReactNode } from "react";
import { fmtUsd, useStore } from "@/lib/store";
import type { Score, UsageRecord } from "@/lib/types";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Card({ children, className, title, action, subtitle }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-slate-200/80 bg-white shadow-card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Button({ children, onClick, variant = "primary", disabled, loading, className, type = "button", title }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "success"; disabled?: boolean; loading?: boolean; className?: string; type?: "button" | "submit"; title?: string }) {
  const styles = {
    primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20",
    secondary: "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50",
    ghost: "text-slate-600 hover:bg-slate-100",
    success: "bg-emerald-600 text-white hover:bg-emerald-700",
  }[variant];
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled || loading} className={cx("inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50", styles, className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ScoreBadge({ score, size = "md" }: { score?: Score; size?: "md" | "lg" }) {
  if (!score) return <span className="text-xs text-slate-400">—</span>;
  const color = score.tier === "Hot" ? "bg-rose-50 text-rose-700 ring-rose-200" : score.tier === "Warm" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset", color, size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs")}>
      {score.score}
      <span className="font-medium opacity-80">{score.tier}</span>
      {score.source === "rules" && <span className="font-normal opacity-60">· rules</span>}
    </span>
  );
}

export function ModelBadge({ usage }: { usage?: UsageRecord }) {
  const { status } = useStore();
  if (!usage) return null;
  const label = status?.catalog.find((m) => m.id === usage.model)?.label ?? usage.model;
  const tierColor = usage.tier === "economy" ? "text-emerald-700 bg-emerald-50 ring-emerald-200" : usage.tier === "balanced" ? "text-sky-700 bg-sky-50 ring-sky-200" : "text-violet-700 bg-violet-50 ring-violet-200";
  const savedPct = usage.baselineCost > 0 ? Math.round((1 - usage.cost / usage.baselineCost) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]" title={usage.reason}>
      <span className={cx("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold ring-1 ring-inset", tierColor)}>
        <Zap className="h-3 w-3" />
        {label}
      </span>
      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">{(usage.promptTokens + usage.completionTokens).toLocaleString()} tok</span>
      <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-white">{fmtUsd(usage.cost)}</span>
      {savedPct > 0 && <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700">−{savedPct}% vs premium</span>}
      {usage.cached && <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700"><Database className="h-3 w-3" />cached</span>}
      {usage.escalated && <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-orange-700">escalated</span>}
      <span className={cx("rounded-md px-1.5 py-0.5", usage.mode === "live" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{usage.mode === "live" ? "live" : "simulated"}</span>
      <span className="text-slate-400">{usage.latencyMs} ms</span>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-10 text-center">
      <div className="mb-3 rounded-full bg-white p-3 text-brand-500 shadow-card">{icon ?? <Sparkles className="h-5 w-5" />}</div>
      <p className="text-sm font-medium text-slate-800">{title}</p>
      {body && <p className="mt-1 max-w-sm text-xs text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 break-words">{message}</div>
      {onRetry && (
        <button onClick={onRetry} className="text-xs font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="relative h-3 overflow-hidden rounded bg-slate-100" style={{ width: `${90 - i * 12}%` }}>
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        </div>
      ))}
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

export function Stat({ label, value, hint, icon, accent }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className={cx("rounded-lg p-1.5", accent ?? "bg-brand-50 text-brand-600")}>{icon}</span>}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</div>
      <ul className="space-y-1 text-xs text-slate-700">
        {items.length ? items.map((x, i) => <li key={i} className="flex gap-1.5"><span className="text-brand-400">•</span>{x}</li>) : <li className="text-slate-400">None found</li>}
      </ul>
    </div>
  );
}

export function StageBadge({ s }: { s: string }) {
  const map: Record<string, string> = { new: "bg-slate-100 text-slate-600", researched: "bg-sky-50 text-sky-700", scored: "bg-indigo-50 text-indigo-700", outreach_ready: "bg-amber-50 text-amber-700", approved: "bg-emerald-50 text-emerald-700" };
  return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", map[s])}>{s.replace("_", " ")}</span>;
}
