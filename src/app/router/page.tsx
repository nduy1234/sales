"use client";

import { Cpu, Database, KeyRound, PiggyBank, Receipt, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, EmptyState, PageHeader, Skeleton, Stat, cx } from "@/components/ui";
import { TASKS } from "@/lib/models";
import { fmtUsd, totals, useStore } from "@/lib/store";

const TIER_STYLE = { economy: "bg-emerald-50 text-emerald-700", balanced: "bg-sky-50 text-sky-700", premium: "bg-violet-50 text-violet-700" };

export default function RouterPage() {
  const { status, usage, refreshStatus } = useStore();
  const [checking, setChecking] = useState(false);
  const t = totals(usage);
  const label = (id: string) => status?.catalog.find((m) => m.id === id)?.label ?? id;

  const byTask = useMemo(() => {
    const m = new Map<string, { task: string; routed: number; premium: number; calls: number }>();
    for (const u of usage) {
      const k = TASKS[u.task]?.label ?? u.task;
      const e = m.get(k) ?? { task: k, routed: 0, premium: 0, calls: 0 };
      e.routed += u.cost;
      e.premium += u.baselineCost;
      e.calls++;
      m.set(k, e);
    }
    return [...m.values()];
  }, [usage]);

  return (
    <div>
      <PageHeader title="Cost-Optimized AI Router" subtitle="Every task is routed through TokenRouter to the cheapest model that meets its quality bar. Savings are measured against running the same tokens on the premium model." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Actual AI spend" value={<span className="font-mono">{fmtUsd(t.spent)}</span>} hint={`${t.calls} calls · ${t.tokens.toLocaleString()} tokens`} icon={<Receipt className="h-4 w-4" />} />
        <Stat label="All-premium baseline" value={<span className="font-mono">{fmtUsd(t.baseline)}</span>} hint="same tokens on premium model" icon={<Cpu className="h-4 w-4" />} accent="bg-violet-50 text-violet-600" />
        <Stat label="Total saved" value={<span className="font-mono text-emerald-600">{fmtUsd(t.saved)}</span>} hint={`${t.pct.toFixed(1)}% cheaper`} icon={<PiggyBank className="h-4 w-4" />} accent="bg-emerald-50 text-emerald-600" />
        <Stat label="Cache hits" value={t.cached} hint="repeat requests served at $0" icon={<Database className="h-4 w-4" />} accent="bg-amber-50 text-amber-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Gateway connection" subtitle="Key stays server-side; the browser never sees it">
          {!status ? (
            <Skeleton lines={4} />
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <KeyRound className={cx("h-4 w-4", status.live ? "text-emerald-600" : "text-amber-500")} />
                {status.live ? "TOKENROUTER_API_KEY is set" : "No TOKENROUTER_API_KEY — simulated mode"}
              </div>
              <div className="text-xs text-slate-500">Base URL: <code className="rounded bg-slate-100 px-1">{status.baseUrl}</code></div>
              {status.live ? (
                <>
                  <Button variant="secondary" loading={checking} onClick={async () => { setChecking(true); await refreshStatus(true); setChecking(false); }}>
                    <ShieldCheck className="h-4 w-4" /> Verify key (no tokens used)
                  </Button>
                  {status.verified && <p className={cx("text-xs", status.verified.ok ? "text-emerald-700" : "text-rose-700")}>{status.verified.message}</p>}
                </>
              ) : (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Outputs are templated and costs are estimated from text length. Add your key to <code>.env.local</code> and restart to route real requests.</p>
              )}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2" title="Model catalog" subtitle="List-price estimates used to price returned token counts (USD per 1M tokens)">
          {!status ? (
            <Skeleton lines={3} />
          ) : (
            <div className="-m-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-2.5">Model</th><th className="px-5 py-2.5">Tier</th><th className="px-5 py-2.5 text-right">Input</th><th className="px-5 py-2.5 text-right">Output</th><th className="px-5 py-2.5 text-right">vs premium</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {status.catalog.map((m) => {
                    const prem = status.catalog[status.catalog.length - 1];
                    const ratio = (prem.inPer1M + prem.outPer1M) / (m.inPer1M + m.outPer1M);
                    return (
                      <tr key={m.id}>
                        <td className="px-5 py-3"><div className="font-medium text-slate-900">{m.label}</div><div className="font-mono text-[11px] text-slate-400">{m.id}</div></td>
                        <td className="px-5 py-3"><span className={cx("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", TIER_STYLE[m.tier])}>{m.tier}</span></td>
                        <td className="px-5 py-3 text-right font-mono">${m.inPer1M.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-mono">${m.outPer1M.toFixed(2)}</td>
                        <td className="px-5 py-3 text-right font-mono text-emerald-600">{ratio > 1.01 ? `${ratio.toFixed(0)}× cheaper` : "baseline"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Routing policy" subtitle="Complexity sets the minimum quality; Premium mode adds one level">
          {!status ? (
            <Skeleton lines={5} />
          ) : (
            <div className="space-y-3">
              {status.routing.map((r) => (
                <div key={r.task} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-900">{r.label}</div>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-slate-400">complexity {r.complexity}</span>
                      <span className="rounded-md bg-slate-900 px-1.5 py-0.5 font-medium text-white">{label(r.standard)}</span>
                      {r.premium !== r.standard && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-700">premium → {label(r.premium)}</span>}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{r.reason}</p>
                </div>
              ))}
              <ul className="space-y-1 pt-1 text-[11px] text-slate-500">
                <li>• Identical requests are cached server-side for 6h (no repeat spend).</li>
                <li>• Stored research/scores are reused unless you ask for a fresh run.</li>
                <li>• Unparseable output escalates once to the next tier — never an open-ended loop.</li>
                <li>• Prompts send only needed fields; inputs are truncated (notes 500 chars, site text 1,800).</li>
              </ul>
            </div>
          )}
        </Card>

        <Card title="Cost by task" subtitle="Routed (actual) vs. premium baseline">
          {byTask.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byTask} margin={{ left: 4, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="task" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tickFormatter={(v) => `$${Number(v).toFixed(3)}`} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={58} />
                  <Tooltip formatter={(v: number) => fmtUsd(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="routed" name="Routed" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="premium" name="All-premium" fill="#c4b5fd" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No usage yet" body="Run the agent workflow or generate content to populate this chart." />
          )}
        </Card>
      </div>

      <Card className="mt-6" title="Request log" subtitle="Every AI call: model chosen, tokens, cost and why">
        {usage.length === 0 ? (
          <EmptyState title="No requests yet" />
        ) : (
          <div className="-m-5 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-2.5">Time</th><th className="px-4 py-2.5">Task</th><th className="px-4 py-2.5">Subject</th><th className="px-4 py-2.5">Model</th><th className="px-4 py-2.5 text-right">Tokens in/out</th><th className="px-4 py-2.5 text-right">Cost</th><th className="px-4 py-2.5 text-right">Premium</th><th className="px-4 py-2.5">Mode</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {usage.slice(0, 100).map((u) => (
                  <tr key={u.id} title={u.reason} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{new Date(u.at).toLocaleTimeString()}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{TASKS[u.task]?.label ?? u.task}</td>
                    <td className="max-w-[160px] truncate px-4 py-2.5 text-slate-600">{u.subject ?? "—"}</td>
                    <td className="px-4 py-2.5"><span className={cx("rounded-md px-1.5 py-0.5 font-semibold", TIER_STYLE[u.tier])}>{label(u.model)}</span>{u.escalated && <span className="ml-1 text-orange-600">↑</span>}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-600">{u.promptTokens}/{u.completionTokens}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900">{fmtUsd(u.cost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400 line-through">{fmtUsd(u.baselineCost)}</td>
                    <td className="px-4 py-2.5">{u.cached ? <span className="text-amber-600">cached</span> : u.mode === "live" ? <span className="text-emerald-600">live</span> : <span className="text-slate-400">simulated</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
