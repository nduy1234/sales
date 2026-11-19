"use client";

import { CheckCircle2, Circle, Loader2, Megaphone, Play, Search, Send, ShieldCheck, Target, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Card, CopyButton, ErrorBanner, ModelBadge, List, PageHeader, ScoreBadge, Skeleton, cx, inputCls } from "@/components/ui";
import { fmtUsd, useStore } from "@/lib/store";
import { bump, useAgent, type Result } from "@/lib/useAgent";
import type { ContentPost, Outreach, Prospect, Research, Score, UsageRecord } from "@/lib/types";

type StepKey = "research" | "score" | "outreach" | "linkedin";
type StepState = { status: "idle" | "running" | "done" | "error"; usage?: UsageRecord; reused?: boolean; error?: string };

const STEPS: { key: StepKey; title: string; desc: string; icon: typeof Search }[] = [
  { key: "research", title: "Research prospect", desc: "Needs, pain points, buyer roles, intent signals", icon: Search },
  { key: "score", title: "Score buying intent", desc: "Free rule signals + cheap-model adjustment", icon: Target },
  { key: "outreach", title: "Draft personalized outreach", desc: "Brand-voice email with next steps", icon: Send },
  { key: "linkedin", title: "Create LinkedIn post", desc: "Hook, body, hashtags, SEO keywords", icon: Megaphone },
];

const idle = (): Record<StepKey, StepState> => ({ research: { status: "idle" }, score: { status: "idle" }, outreach: { status: "idle" }, linkedin: { status: "idle" } });

export default function WorkflowPage() {
  const { prospects, updateProspect, updatePost, posts, status } = useStore();
  const agent = useAgent();
  const ranked = useMemo(() => [...prospects].sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0)), [prospects]);
  const [pid, setPid] = useState<string>("");
  const selectedId = pid || ranked[0]?.id || "";
  const prospect = prospects.find((p) => p.id === selectedId);
  const [steps, setSteps] = useState(idle);
  const [running, setRunning] = useState(false);
  const [fresh, setFresh] = useState(true);
  const [postId, setPostId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const post = posts.find((p) => p.id === postId);

  const set = (k: StepKey, s: StepState) => setSteps((prev) => ({ ...prev, [k]: s }));

  async function step<T>(k: StepKey, fn: () => Promise<Result<T>>): Promise<T> {
    set(k, { status: "running" });
    try {
      const r = await fn();
      set(k, { status: "done", usage: r.usage, reused: r.reused });
      return r.data;
    } catch (e) {
      set(k, { status: "error", error: (e as Error).message });
      throw e;
    }
  }

  async function run() {
    if (!prospect) return;
    setRunning(true);
    setSteps(idle());
    setPostId(null);
    setElapsed(null);
    const t0 = Date.now();
    setStartedAt(t0);
    try {
      // Pass forward a local copy so each step sees the previous step's output.
      let p: Prospect = { ...prospect, outreach: undefined };
      const research = await step<Research>("research", () => agent.research(p, fresh));
      p = { ...p, research };
      const score = await step<Score>("score", () => agent.score(p, fresh));
      p = { ...p, score };
      await step<Outreach>("outreach", () => agent.outreach(p));
      const topic = `${research.painPoints[0] ?? "Turning local search into bookings"} — lessons for ${p.industry.toLowerCase()} businesses`;
      const cp = await step<ContentPost>("linkedin", () => agent.post(topic, p));
      setPostId(cp.id);
    } catch {
      /* step already shows the error */
    } finally {
      setElapsed(Date.now() - t0);
      setRunning(false);
    }
  }

  const usages = Object.values(steps).map((s) => s.usage).filter(Boolean) as UsageRecord[];
  const spent = usages.reduce((s, u) => s + u.cost, 0);
  const baseline = usages.reduce((s, u) => s + u.baselineCost, 0);
  const tokens = usages.reduce((s, u) => s + u.promptTokens + u.completionTokens, 0);
  const allDone = Object.values(steps).every((s) => s.status === "done");
  const current = prospects.find((p) => p.id === selectedId);

  return (
    <div>
      <PageHeader
        title="Autonomous Agent Workflow"
        subtitle="Research → score → outreach → content in one run. Every step shows the model chosen and what it actually cost. Nothing is sent or published without your approval."
      />

      <Card className="mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">Prospect</label>
            <select className={inputCls} value={selectedId} onChange={(e) => { setPid(e.target.value); setSteps(idle()); setPostId(null); setElapsed(null); }} disabled={running}>
              {ranked.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.company} — {p.industry}, {p.location} · score {p.score?.score ?? "—"}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} disabled={running} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
            Fresh run (uncheck to reuse stored research &amp; score at $0)
          </label>
          <Button onClick={run} loading={running} disabled={!prospect} className="px-5 py-2.5">
            {!running && <Play className="h-4 w-4" />}
            {running ? "Agent running…" : "Run agent workflow"}
          </Button>
        </div>
        {status && !status.live && (
          <p className="mt-3 text-xs text-amber-700">
            Simulated mode: outputs are templated and token counts are estimated, because no <code className="rounded bg-amber-50 px-1">TOKENROUTER_API_KEY</code> is set. Add one to <code className="rounded bg-amber-50 px-1">.env.local</code> for live model calls.
          </p>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {STEPS.map((s, i) => {
            const st = steps[s.key];
            return (
              <div key={s.key} className="relative">
                {i < STEPS.length - 1 && <div className={cx("absolute left-[27px] top-14 h-[calc(100%-2rem)] w-px", st.status === "done" ? "bg-brand-300" : "bg-slate-200")} />}
                <Card className={cx("transition", st.status === "running" && "ring-2 ring-brand-200")}>
                  <div className="flex gap-4">
                    <StepIcon state={st.status} Icon={s.icon} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Step {i + 1}</div>
                          <h3 className="text-sm font-semibold text-slate-900">{s.title}</h3>
                          <p className="text-xs text-slate-500">{s.desc}</p>
                        </div>
                        {st.usage && <ModelBadge usage={st.usage} />}
                        {st.reused && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Reused stored result · no API call · $0</span>}
                      </div>
                      <div className="mt-3">
                        {st.status === "running" && <Skeleton lines={3} />}
                        {st.status === "error" && <ErrorBanner message={st.error ?? "Step failed"} onRetry={run} />}
                        {st.status === "done" && current && <StepOutput k={s.key} p={current} post={post} onApprove={() => current.outreach && updateProspect(current.id, { outreach: { ...current.outreach, approved: true }, status: bump(current.status, "approved") })} onApprovePost={() => post && updatePost(post.id, { status: "approved" })} />}
                        {st.status === "idle" && <p className="text-xs text-slate-400">Waiting…</p>}
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>

        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card title="Run cost" subtitle="Actual tokens priced per model vs. running every step on the premium model">
            <div className="text-xs text-slate-500">This run</div>
            <div className="font-mono text-3xl font-semibold text-slate-900">{fmtUsd(spent)}</div>
            <div className="mt-3 space-y-2 text-sm">
              <Row k="All-premium baseline" v={<span className="font-mono text-slate-500 line-through">{fmtUsd(baseline)}</span>} />
              <Row k="Saved" v={<span className="font-mono font-semibold text-emerald-600">{fmtUsd(Math.max(0, baseline - spent))} {baseline > 0 && `(${(((baseline - spent) / baseline) * 100).toFixed(0)}%)`}</span>} />
              <Row k="Tokens" v={<span className="font-mono">{tokens.toLocaleString()}</span>} />
              <Row k={usages[0]?.mode === "simulated" ? "AI calls (simulated)" : "API calls"} v={<span className="font-mono">{usages.filter((u) => !u.cached).length}</span>} />
              <Row k="Wall time" v={<span className="font-mono">{elapsed != null ? `${(elapsed / 1000).toFixed(1)}s` : running && startedAt ? "running…" : "—"}</span>} />
            </div>
            {baseline > 0 && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${Math.max(2, (spent / baseline) * 100)}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Bar = this run as a share of the premium-only cost</div>
              </div>
            )}
            {usages[0]?.mode === "simulated" && <p className="mt-3 text-[11px] text-amber-700">Simulated: costs estimated from prompt/response length.</p>}
          </Card>

          {allDone && current && (
            <Card title="Human approval" subtitle="The agent never sends or publishes on its own">
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">{current.outreach?.approved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />} Outreach email</li>
                <li className="flex items-center gap-2">{post?.status === "approved" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-slate-300" />} LinkedIn post</li>
              </ul>
              <p className="mt-3 text-[11px] text-slate-500">Approved items are copied/handed off manually — no email or LinkedIn account is connected in this MVP.</p>
            </Card>
          )}

          {current && (
            <Card title="Prospect">
              <div className="text-sm font-semibold text-slate-900">{current.company}</div>
              <div className="text-xs text-slate-500">{current.industry} · {current.size} employees · {current.location}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {current.signals.map((s) => (
                  <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s}</span>
                ))}
              </div>
              <Link href="/prospects" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">All prospects →</Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{k}</span>
      {v}
    </div>
  );
}

function StepIcon({ state, Icon }: { state: StepState["status"]; Icon: typeof Search }) {
  const base = "relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl";
  if (state === "running") return <div className={cx(base, "bg-brand-600 text-white")}><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (state === "done") return <div className={cx(base, "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200")}><CheckCircle2 className="h-5 w-5" /></div>;
  if (state === "error") return <div className={cx(base, "bg-rose-50 text-rose-600 ring-1 ring-rose-200")}><XCircle className="h-5 w-5" /></div>;
  return <div className={cx(base, "bg-slate-50 text-slate-400 ring-1 ring-slate-200")}><Icon className="h-5 w-5" /></div>;
}

function StepOutput({ k, p, post, onApprove, onApprovePost }: { k: StepKey; p: Prospect; post?: ContentPost; onApprove: () => void; onApprovePost: () => void }) {
  if (k === "research" && p.research) {
    const r = p.research;
    return (
      <div className="space-y-3 text-sm">
        <p className="text-slate-700">{r.summary}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <List title="Needs" items={r.needs} />
          <List title="Pain points" items={r.painPoints} />
          <List title="Likely decision-makers" items={r.decisionMakers.map((d) => `${d.title} — ${d.why}`)} />
        </div>
        <p className="text-[11px] text-slate-400">Sources: {r.sources.join(" · ")}</p>
      </div>
    );
  }
  if (k === "score" && p.score) {
    const s = p.score;
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex flex-col items-center rounded-xl bg-slate-50 px-5 py-3">
          <div className="text-3xl font-bold text-slate-900">{s.score}</div>
          <ScoreBadge score={s} />
        </div>
        <div className="flex-1 space-y-2 text-sm">
          <p className="text-slate-700">{s.rationale}</p>
          <div className="flex flex-wrap gap-1">
            {s.signals.map((x) => (
              <span key={x.label} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">{x.label} +{x.weight}</span>
            ))}
            <span className={cx("rounded-full px-2 py-0.5 text-[11px]", s.adjustment >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>AI adjustment {s.adjustment >= 0 ? "+" : ""}{s.adjustment}</span>
          </div>
          {s.bestTiming && <p className="text-xs text-slate-500">Best timing: {s.bestTiming}</p>}
        </div>
      </div>
    );
  }
  if (k === "outreach" && p.outreach) {
    const o = p.outreach;
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm">
          <div className="mb-2 text-xs text-slate-500">Subject: <span className="font-medium text-slate-800">{o.subject}</span></div>
          <p className="whitespace-pre-line text-slate-700">{o.message}</p>
        </div>
        <List title="Recommended next steps" items={o.nextSteps} />
        <div className="flex flex-wrap gap-2">
          {o.approved ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" /> Approved — ready to send manually</span>
          ) : (
            <Button variant="success" onClick={onApprove}><ShieldCheck className="h-4 w-4" /> Approve outreach</Button>
          )}
          <CopyButton text={`Subject: ${o.subject}\n\n${o.message}`} />
        </div>
      </div>
    );
  }
  if (k === "linkedin" && post) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="whitespace-pre-line text-slate-700">{post.body}</p>
          <p className="mt-2 text-brand-600">{post.hashtags.map((h) => `#${h}`).join(" ")}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {post.keywords.map((kw) => (
            <span key={kw} className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">SEO: {kw}</span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {post.status === "approved" ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700"><ShieldCheck className="h-4 w-4" /> Approved — ready to publish manually</span>
          ) : (
            <Button variant="success" onClick={onApprovePost}><ShieldCheck className="h-4 w-4" /> Approve post</Button>
          )}
          <CopyButton text={`${post.body}\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}`} />
        </div>
      </div>
    );
  }
  return null;
}
