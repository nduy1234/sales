"use client";

import { ArrowRight, Coins, Flame, Lightbulb, PenSquare, PiggyBank, Send, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Card, EmptyState, ErrorBanner, ModelBadge, PageHeader, ScoreBadge, Skeleton, StageBadge, Stat, cx } from "@/components/ui";
import { fmtMoney, fmtUsd, totals, useStore } from "@/lib/store";
import type { Recommendation, UsageRecord } from "@/lib/types";

const TIER_COLOR = { Hot: "#f43f5e", Warm: "#f59e0b", Cold: "#94a3b8" };

export default function Dashboard() {
  const { prospects, posts, usage, recs, setRecs, callAgent, brand, ready } = useStore();
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [recErr, setRecErr] = useState<string | null>(null);
  const [recUsage, setRecUsage] = useState<UsageRecord | undefined>();
  const t = totals(usage);

  const ranked = useMemo(() => [...prospects].sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0)), [prospects]);
  const qualified = prospects.filter((p) => (p.score?.score ?? 0) >= 60);
  const weighted = prospects.reduce((s, p) => s + p.dealValue * ((p.score?.score ?? 0) / 100), 0);
  const outreachDrafted = prospects.filter((p) => p.outreach).length;
  const outreachApproved = prospects.filter((p) => p.outreach?.approved).length;

  const scoreData = ranked.map((p) => ({ name: p.company.split(" ")[0], score: p.score?.score ?? 0, tier: p.score?.tier ?? "Cold" }));
  const costSeries = useMemo(() => {
    let a = 0;
    let b = 0;
    return [...usage].reverse().map((u, i) => {
      a += u.cost;
      b += u.baselineCost;
      return { i: i + 1, routed: +a.toFixed(6), premium: +b.toFixed(6) };
    });
  }, [usage]);

  const funnel = [
    { k: "Prospects", v: prospects.length },
    { k: "Researched", v: prospects.filter((p) => p.research).length },
    { k: "AI-scored", v: prospects.filter((p) => p.score?.source === "ai").length },
    { k: "Outreach drafted", v: outreachDrafted },
    { k: "Approved", v: outreachApproved },
  ];

  const today = new Date().toISOString().slice(0, 10);

  async function genRecs() {
    setLoadingRecs(true);
    setRecErr(null);
    try {
      const stats = {
        leads: prospects.length,
        hot: prospects.filter((p) => p.score?.tier === "Hot").length,
        unresearched: prospects.filter((p) => !p.research).length,
        awaitingApproval: prospects.filter((p) => p.outreach && !p.outreach.approved).length,
        posts: posts.length,
        top: ranked.slice(0, 3).map((p) => ({ company: p.company, score: p.score?.score ?? 0, status: p.status })),
      };
      const r = await callAgent<Recommendation[]>("recommendations", { stats });
      setRecs({ date: today, items: r.data });
      setRecUsage(r.usage);
    } catch (e) {
      setRecErr((e as Error).message);
    } finally {
      setLoadingRecs(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={`Good day, ${brand.name.split(" ")[0]}`}
        subtitle="Your AI revenue engine at a glance — leads, outreach, content and exactly what the AI cost."
        action={
          <Link href="/workflow">
            <Button className="px-4 py-2.5">
              <Sparkles className="h-4 w-4" /> Run agent workflow <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Qualified leads" value={qualified.length} hint={`score ≥ 60 of ${prospects.length}`} icon={<Users className="h-4 w-4" />} />
        <Stat label="Hot leads" value={prospects.filter((p) => p.score?.tier === "Hot").length} hint="score ≥ 75" icon={<Flame className="h-4 w-4" />} accent="bg-rose-50 text-rose-600" />
        <Stat label="Weighted opportunity" value={fmtMoney(weighted)} hint="deal value × intent (estimate)" icon={<Coins className="h-4 w-4" />} accent="bg-amber-50 text-amber-600" />
        <Stat label="Outreach" value={`${outreachApproved}/${outreachDrafted}`} hint="approved / drafted" icon={<Send className="h-4 w-4" />} accent="bg-sky-50 text-sky-600" />
        <Stat label="Content" value={posts.length} hint={`${posts.filter((p) => p.status === "approved").length} approved posts`} icon={<PenSquare className="h-4 w-4" />} accent="bg-violet-50 text-violet-600" />
        <Stat label="AI spend" value={<span className="font-mono">{fmtUsd(t.spent)}</span>} hint={t.calls ? <span className="text-emerald-600">saved {fmtUsd(t.saved)} ({t.pct.toFixed(0)}%)</span> : "no calls yet"} icon={<PiggyBank className="h-4 w-4" />} accent="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Lead intent scores" subtitle="Rule signals (free) refined by AI when the agent runs">
          {!ready ? (
            <Skeleton lines={5} />
          ) : scoreData.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={scoreData} margin={{ left: -20, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={44}>
                    {scoreData.map((d, i) => (
                      <Cell key={i} fill={TIER_COLOR[d.tier as keyof typeof TIER_COLOR]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No prospects yet" action={<Link href="/prospects"><Button variant="secondary">Add prospect</Button></Link>} />
          )}
        </Card>

        <Card
          title={<span className="flex items-center gap-1.5"><Lightbulb className="h-4 w-4 text-amber-500" /> Today’s recommendations</span>}
          subtitle={recs?.date === today ? "Generated today · cached until tomorrow" : "One cheap-model call per day"}
          action={
            <Button variant="secondary" onClick={genRecs} loading={loadingRecs} className="px-2.5 py-1.5 text-xs">
              {recs?.date === today ? "Refresh" : "Generate"}
            </Button>
          }
        >
          {loadingRecs ? (
            <Skeleton lines={6} />
          ) : recErr ? (
            <ErrorBanner message={recErr} onRetry={genRecs} />
          ) : recs?.items.length ? (
            <div className="space-y-3">
              {recs.items.map((r, i) => (
                <div key={i} className="flex gap-3">
                  <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", r.priority === "high" ? "bg-rose-500" : r.priority === "medium" ? "bg-amber-400" : "bg-slate-300")} />
                  <div>
                    <div className="text-sm font-medium text-slate-800">{r.title}</div>
                    <div className="text-xs text-slate-500">{r.detail}</div>
                  </div>
                </div>
              ))}
              {recUsage && <div className="border-t border-slate-100 pt-3"><ModelBadge usage={recUsage} /></div>}
            </div>
          ) : (
            <EmptyState title="No plan yet today" body="Generate a prioritized action list from your pipeline for a fraction of a cent." />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Cumulative AI cost: routed vs. all-premium" subtitle="Same token counts priced on the routed model and on the premium model">
          {costSeries.length ? (
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={costSeries} margin={{ left: 0, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.3} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient>
                    <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="i" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} label={{ value: "AI calls", position: "insideBottomRight", offset: -2, fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tickFormatter={(v) => `$${Number(v).toFixed(3)}`} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} width={58} />
                  <Tooltip formatter={(v: number) => fmtUsd(v)} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Area type="monotone" dataKey="premium" name="All-premium" stroke="#8b5cf6" fill="url(#gp)" strokeWidth={2} />
                  <Area type="monotone" dataKey="routed" name="Routed (actual)" stroke="#10b981" fill="url(#gr)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No AI calls yet" body="Run the agent workflow to see routed cost vs. a premium-only baseline." action={<Link href="/workflow"><Button>Run workflow</Button></Link>} />
          )}
        </Card>

        <Card title="Pipeline funnel">
          <div className="space-y-3">
            {funnel.map((f) => (
              <div key={f.k}>
                <div className="mb-1 flex justify-between text-xs"><span className="text-slate-600">{f.k}</span><span className="font-semibold text-slate-900">{f.v}</span></div>
                <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500" style={{ width: `${prospects.length ? (f.v / prospects.length) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6" title="Top opportunities" action={<Link href="/prospects" className="text-xs font-medium text-brand-600 hover:underline">View all</Link>}>
        <div className="-mx-5 -my-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <tr><th className="px-5 py-2.5">Company</th><th className="px-5 py-2.5">Intent</th><th className="px-5 py-2.5">Deal value</th><th className="hidden px-5 py-2.5 md:table-cell">Top signal</th><th className="px-5 py-2.5">Stage</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ranked.slice(0, 5).map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3"><div className="font-medium text-slate-900">{p.company}</div><div className="text-xs text-slate-500">{p.industry} · {p.location}</div></td>
                  <td className="px-5 py-3"><ScoreBadge score={p.score} /></td>
                  <td className="px-5 py-3 font-mono text-slate-700">{fmtMoney(p.dealValue)}</td>
                  <td className="hidden px-5 py-3 text-xs text-slate-600 md:table-cell">{p.signals[0] ?? "—"}</td>
                  <td className="px-5 py-3"><StageBadge s={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-4 text-center text-[11px] text-slate-400">Sample prospects are fictional. Opportunity figures are estimates from deal value × intent score — not booked revenue.</p>
    </div>
  );
}
