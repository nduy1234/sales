"use client";

import { Bot, Brain, CheckCircle2, CircleSlash, Megaphone, Rocket, Search, Send, Square, Target, TrendingUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { ApprovalQueue } from "@/components/ApprovalQueue";
import { Button, Card, ErrorBanner, ModelBadge, PageHeader, Stat, cx } from "@/components/ui";
import { winProbability } from "@/lib/revenue";
import { fmtMoney, fmtUsd, useStore } from "@/lib/store";
import type { Prospect, UsageRecord } from "@/lib/types";
import { useAgent, type Result } from "@/lib/useAgent";

type Kind = "plan" | "research" | "score" | "decision" | "outreach" | "content" | "skip" | "done" | "error";
interface Entry { id: number; kind: Kind; text: string; usage?: UsageRecord; reused?: boolean }

const ICON: Record<Kind, typeof Bot> = { plan: Brain, research: Search, score: Target, decision: Brain, outreach: Send, content: Megaphone, skip: CircleSlash, done: CheckCircle2, error: CircleSlash };

export default function AutopilotPage() {
  const { prospects, status, assumptions } = useStore();
  const agent = useAgent();
  const [maxProspects, setMax] = useState(3);
  const [threshold, setThreshold] = useState(60);
  const [log, setLog] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ researched: number; drafted: number; skipped: number; posts: number; cost: number; baseline: number; projected: number; secs: number } | null>(null);
  const stop = useRef(false);
  const seq = useRef(0);

  // Candidates: not yet contacted, at least moderately promising on free rule signals.
  const candidates = useMemo(() => prospects.filter((p) => !p.outreach && (p.score?.score ?? 0) >= 40).sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0)), [prospects]);

  const add = (e: Omit<Entry, "id">) => setLog((l) => [...l, { ...e, id: ++seq.current }]);

  async function run() {
    stop.current = false;
    setRunning(true);
    setErr(null);
    setLog([]);
    setSummary(null);
    const t0 = Date.now();
    const usages: UsageRecord[] = [];
    let researched = 0, drafted = 0, skipped = 0, posts = 0, projected = 0;
    const track = <T,>(r: Result<T>) => {
      if (r.usage) usages.push(r.usage);
      return r;
    };
    try {
      const batch = candidates.slice(0, maxProspects);
      add({ kind: "plan", text: batch.length ? `Plan: work the top ${batch.length} uncontacted prospect${batch.length > 1 ? "s" : ""} (${batch.map((p) => p.company).join(", ")}), draft outreach only for intent ≥ ${threshold}, then create today's LinkedIn + X content. Bounded to ${maxProspects} prospects; nothing is sent.` : "No uncontacted prospects with promising signals. Skipping to content." });

      const pains: string[] = [];
      for (const orig of batch) {
        if (stop.current) break;
        let p: Prospect = orig;
        const r = track(await agent.research(p));
        p = { ...p, research: r.data };
        researched++;
        pains.push(...r.data.painPoints.slice(0, 1));
        add({ kind: "research", text: `Researched ${p.company}: ${r.data.summary}`, usage: r.usage, reused: r.reused });
        if (stop.current) break;

        const s = track(await agent.score(p));
        p = { ...p, score: s.data };
        add({ kind: "score", text: `Scored ${p.company} at ${s.data.score} (${s.data.tier}). ${s.data.rationale}`, usage: s.usage, reused: s.reused });

        if (s.data.score < threshold) {
          skipped++;
          add({ kind: "skip", text: `Decision: ${p.company} is below the ${threshold} threshold, so no outreach. Added to nurture instead of spending a writing call.` });
          continue;
        }
        add({ kind: "decision", text: `Decision: ${p.company} qualifies (${s.data.score} ≥ ${threshold}). Drafting personalized outreach.` });
        if (stop.current) break;
        const o = track(await agent.outreach(p));
        drafted++;
        const value = p.dealValue * winProbability(s.data.score, assumptions);
        projected += value;
        add({ kind: "outreach", text: `Drafted "${o.data.subject}" for ${p.contact?.name ?? p.company}. Projected value if approved: ${fmtMoney(value)}.`, usage: o.usage });
      }

      if (!stop.current) {
        const topic = pains[0] ? `A lesson from this week's prospect research: ${pains[0].toLowerCase()}` : "Why local service businesses lose bookings on mobile";
        add({ kind: "plan", text: `Content: today's theme comes from the strongest pain found in research — "${topic}".` });
        const li = track(await agent.post(topic, undefined, false, "linkedin"));
        posts++;
        add({ kind: "content", text: `LinkedIn post drafted: "${li.data.hook}"`, usage: li.usage });
        if (!stop.current) {
          const x = track(await agent.post(topic, undefined, false, "x"));
          posts++;
          add({ kind: "content", text: `X thread drafted (${x.data.body.split(/\n\n/).length} tweets): "${x.data.hook.slice(0, 90)}${x.data.hook.length > 90 ? "…" : ""}"`, usage: x.usage });
        }
      }

      const cost = usages.reduce((a, u) => a + u.cost, 0);
      const baseline = usages.reduce((a, u) => a + u.baselineCost, 0);
      add({ kind: "done", text: stop.current ? "Stopped by you. Everything finished so far is saved." : `Done. ${drafted} outreach draft(s) and ${posts} post(s) are waiting in your approval queue.` });
      setSummary({ researched, drafted, skipped, posts, cost, baseline, projected, secs: (Date.now() - t0) / 1000 });
    } catch (e) {
      setErr((e as Error).message);
      add({ kind: "error", text: `Stopped on an error: ${(e as Error).message}` });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Autopilot"
        subtitle="One click: the agent picks your best uncontacted prospects, researches and scores them, decides who deserves outreach, drafts it, and writes today's LinkedIn + X content. You approve; it schedules."
      />

      <Card className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="grid flex-1 gap-4 sm:grid-cols-3">
            <label className="block text-xs font-medium text-slate-600">
              Prospects per run
              <input type="range" min={1} max={5} value={maxProspects} onChange={(e) => setMax(+e.target.value)} disabled={running} className="mt-2 w-full accent-brand-600" />
              <span className="text-slate-900">{maxProspects}</span> <span className="font-normal text-slate-400">· {candidates.length} uncontacted left</span>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Outreach threshold (intent)
              <input type="range" min={40} max={85} step={5} value={threshold} onChange={(e) => setThreshold(+e.target.value)} disabled={running} className="mt-2 w-full accent-brand-600" />
              <span className="text-slate-900">≥ {threshold}</span>
            </label>
            <div className="text-xs text-slate-500">
              <div className="font-medium text-slate-600">Guardrails</div>
              <ul className="mt-1 space-y-0.5">
                <li>• Bounded run, no open-ended loops</li>
                <li>• Stored research reused at $0</li>
                <li>• Never sends or posts</li>
              </ul>
            </div>
          </div>
          <div className="flex gap-2">
            {running && <Button variant="secondary" onClick={() => (stop.current = true)}><Square className="h-4 w-4" /> Stop</Button>}
            <Button onClick={run} loading={running} className="px-6 py-3 text-base">{!running && <Rocket className="h-5 w-5" />} {running ? "Agent working…" : "Run Autopilot"}</Button>
          </div>
        </div>
        {status && !status.live && <p className="mt-3 text-xs text-amber-700">Simulated mode: no TokenRouter key is set, so outputs are templated and costs are estimated from text length.</p>}
      </Card>

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Stat label="Prospects worked" value={summary.researched} hint={`${summary.skipped} below threshold`} icon={<Search className="h-4 w-4" />} />
          <Stat label="Outreach drafted" value={summary.drafted} hint="awaiting approval" icon={<Send className="h-4 w-4" />} accent="bg-sky-50 text-sky-600" />
          <Stat label="Posts created" value={summary.posts} hint="LinkedIn + X" icon={<Megaphone className="h-4 w-4" />} accent="bg-violet-50 text-violet-600" />
          <Stat label="Projected revenue" value={fmtMoney(summary.projected)} hint="if approved · funnel estimate" icon={<TrendingUp className="h-4 w-4" />} accent="bg-amber-50 text-amber-600" />
          <Stat label="AI cost of this run" value={<span className="font-mono">{fmtUsd(summary.cost)}</span>} hint={<span className="text-emerald-600">vs {fmtUsd(summary.baseline)} all-premium · {summary.secs.toFixed(1)}s</span>} icon={<Bot className="h-4 w-4" />} accent="bg-emerald-50 text-emerald-600" />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_440px]">
        <Card title="Agent activity" subtitle="Every step, decision and its cost">
          {err && <div className="mb-3"><ErrorBanner message={err} onRetry={run} /></div>}
          {log.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">{candidates.length} prospect{candidates.length === 1 ? "" : "s"} ready. Press <b className="text-slate-600">Run Autopilot</b> to start.</div>
          ) : (
            <ol className="relative space-y-4 border-l border-slate-200 pl-6">
              {log.map((e) => {
                const Icon = ICON[e.kind];
                return (
                  <li key={e.id} className="relative">
                    <span className={cx("absolute -left-[35px] grid h-6 w-6 place-items-center rounded-full ring-4 ring-white", e.kind === "skip" || e.kind === "error" ? "bg-slate-200 text-slate-500" : e.kind === "decision" || e.kind === "plan" ? "bg-violet-100 text-violet-700" : e.kind === "done" ? "bg-emerald-100 text-emerald-700" : "bg-brand-100 text-brand-700")}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <p className={cx("text-sm", e.kind === "decision" || e.kind === "plan" ? "font-medium text-slate-800" : "text-slate-700")}>{e.text}</p>
                    <div className="mt-1">
                      {e.usage && <ModelBadge usage={e.usage} />}
                      {e.reused && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Reused stored result · no API call · $0</span>}
                    </div>
                  </li>
                );
              })}
              {running && <li className="text-xs text-slate-400">Working…</li>}
            </ol>
          )}
        </Card>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <ApprovalQueue />
        </div>
      </div>
    </div>
  );
}
