"use client";

import { Bot, CheckCircle2, CornerDownRight, Download, FileText, History, Loader2, Send, Square, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, cx, inputCls } from "@/components/ui";
import { parseProspectTable } from "@/lib/discovery";
import { requestsPublishing } from "@/lib/publishing";
import { nextSlots } from "@/lib/schedule";
import { finalize, ruleScore } from "@/lib/scoring";
import { uid, useStore } from "@/lib/store";
import type { Prospect } from "@/lib/types";
import Link from "next/link";
import type { Brand } from "@/lib/types";

type Status = "starting" | "in_progress" | "completed" | "incomplete" | "failed" | "cancelled";
interface Task {
  id: string;
  input: string;
  status: Status;
  answer: string;
  files: { path: string; name: string; bytes: number; type: string }[];
  incompleteReason?: string;
  error?: string;
  parentId?: string;
  canContinue: boolean;
  createdAt: number;
}
interface Live { text: string; activity: string[] }

const TERMINAL = new Set<Status>(["completed", "incomplete", "failed", "cancelled"]);

type PublishMode = "drafts" | "schedule";
const DRAFTS_LINE = "Publishing: Drafts only. Return the LinkedIn and X drafts for my approval; do not publish or schedule anything.";

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function publishingLine(mode: PublishMode, tz: string) {
  if (mode === "drafts") return DRAFTS_LINE;
  // Next upcoming posting windows (same rules as the Content Studio calendar).
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [li] = nextSlots("linkedin", new Date(), new Set());
  const [x] = nextSlots("x", new Date(), new Set());
  return `Publishing: Schedule the LinkedIn post for ${fmt(li)} and the X post for ${fmt(x)} (${tz}) on the connected Zernio accounts above. Check for duplicates first and report the scheduled post IDs or URLs.`;
}

function template(b: Brand, mode: PublishMode = "drafts") {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return `Business: ${b.name}
Offer: ${b.offer}
Target customers: ${b.icp}. Industries: ${b.targetIndustries.join(", ")}.
Geography: United States (local service businesses)
Brand voice: ${b.voice}
Destination link: (add your website URL)
Time zone: ${tz}
Accounts: my LinkedIn and X accounts connected in Zernio
${publishingLine(mode, tz)}

Today (${localDate()}):
1. Find up to 5 prospects matching these customers with recent, public buying-intent signals (e.g. a stated need for a new website, online booking or local SEO). Include source URLs and dates, and separate facts from inference.
2. Write 1 LinkedIn post and 1 X post for today about why local service businesses lose bookings on mobile.`;
}

export default function ResearchPage() {
  const { brand } = useStore();
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [mode, setMode] = useState<PublishMode>("drafts");
  const [consent, setConsent] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const wantsPublish = requestsPublishing(input);
  const followWantsPublish = requestsPublishing(followUp);

  function switchMode(m: PublishMode) {
    setMode(m);
    setConsent(false);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setInput((v) => (/^Publishing:.*$/m.test(v) ? v.replace(/^Publishing:.*$/m, publishingLine(m, tz)) : `${publishingLine(m, tz)}\n${v}`));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setInput((v) => v || template(brand, mode)), [brand]);

  const upsert = useCallback((t: Task) => setTasks((prev) => [t, ...(prev ?? []).filter((x) => x.id !== t.id)].sort((a, b) => b.createdAt - a.createdAt)), []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agent-tasks", { cache: "no-store" });
      const j = await r.json();
      setConfigured(j.configured);
      setTasks(j.tasks);
      return j.tasks as Task[];
    } catch {
      setTasks([]);
      setErr("Could not load your research tasks.");
      return [];
    }
  }, []);

  const follow = useCallback(
    (id: string) => {
      esRef.current?.close();
      setLive({ text: "", activity: [] });
      const es = new EventSource(`/api/agent-tasks/${id}/events`);
      esRef.current = es;
      es.onmessage = (m) => {
        const p = JSON.parse(m.data);
        if (p.kind === "snapshot") setLive({ text: p.text, activity: p.activity });
        else if (p.kind === "text") setLive((l) => ({ text: (l?.text ?? "") + p.delta, activity: l?.activity ?? [] }));
        else if (p.kind === "activity") setLive((l) => ({ text: l?.text ?? "", activity: [...(l?.activity ?? []), p.label].slice(-20) }));
        else if (p.kind === "status") setTasks((prev) => prev?.map((t) => (t.id === id ? { ...t, status: p.status } : t)) ?? prev);
        else if (p.kind === "final") {
          upsert(p.task);
          setLive(null);
          es.close();
        }
      };
      es.onerror = () => {
        // Stream dropped (network, server restart): fall back to polling the task.
        es.close();
        const poll = async () => {
          const r = await fetch(`/api/agent-tasks/${id}`, { cache: "no-store" }).catch(() => null);
          const j = r?.ok ? await r.json() : null;
          if (j?.task) {
            upsert(j.task);
            if (TERMINAL.has(j.task.status)) return setLive(null);
          }
          setTimeout(poll, 4000);
        };
        setTimeout(poll, 2000);
      };
    },
    [upsert],
  );

  useEffect(() => {
    load().then((ts) => {
      const running = ts.find((t) => !TERMINAL.has(t.status));
      const first = running ?? ts[0];
      if (first) {
        setActiveId(first.id);
        if (running) follow(running.id);
      }
    });
    return () => esRef.current?.close();
  }, [load, follow]);

  async function submit(text: string, continueId?: string) {
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch("/api/agent-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text, continueId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start the task.");
      upsert(j.task);
      setActiveId(j.task.id);
      setFollowUp("");
      follow(j.task.id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(id: string) {
    const r = await fetch(`/api/agent-tasks/${id}/cancel`, { method: "POST" });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).error || "Could not cancel.");
  }

  const active = tasks?.find((t) => t.id === activeId);
  const isRunning = active && !TERMINAL.has(active.status);
  const anyRunning = tasks?.some((t) => !TERMINAL.has(t.status));

  return (
    <div>
      <PageHeader title="Research & Publish Agent" subtitle="A cloud agent researches public buying-intent signals and writes today's LinkedIn and X content in your brand voice. It returns drafts by default; it schedules or publishes through your connected Zernio accounts only when your request explicitly asks. It never messages prospects, runs ads or spends money." />

      {!configured && <div className="mb-6"><ErrorBanner message="The research agent is not configured on the server (missing HR_API_KEY). Ask your administrator to add it." /></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card title="New request" subtitle="Business, offer, customers, brand voice, destination link, time zone, accounts and today's scope">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600">Publishing:</span>
              <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
                <button onClick={() => switchMode("drafts")} className={cx("rounded-md px-3 py-1 text-xs font-medium", mode === "drafts" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>Drafts for approval</button>
                <button onClick={() => switchMode("schedule")} className={cx("rounded-md px-3 py-1 text-xs font-medium", mode === "schedule" ? "bg-amber-600 text-white" : "text-slate-600 hover:bg-slate-100")}>Schedule on LinkedIn &amp; X</button>
              </div>
            </div>
            <textarea className={cx(inputCls, "min-h-[260px] font-mono text-[13px] leading-relaxed")} value={input} onChange={(e) => { setInput(e.target.value); setConsent(false); }} maxLength={8000} />
            {wantsPublish && (
              <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>This request asks the agent to <b>publish or schedule</b> on your connected LinkedIn and X accounts. The agent treats that as authorization and will act without a separate draft approval. I confirm the accounts, dates and content scope above.</span>
              </label>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={() => submit(input)} loading={submitting && !followUp} disabled={!configured || !input.trim() || !!anyRunning || (wantsPublish && !consent)} className="px-5 py-2.5">
                {!submitting && <Send className="h-4 w-4" />} {wantsPublish ? "Run agent & schedule" : "Run agent"}
              </Button>
              <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => { setInput(template(brand, mode)); setConsent(false); }}>Reset to brand template</button>
              {anyRunning && <span className="text-xs text-slate-500">One task at a time — wait for the current one to finish.</span>}
            </div>
            {err && <div className="mt-3"><ErrorBanner message={err} /></div>}
          </Card>

          {active ? (
            <Card
              title={<span className="flex items-center gap-2"><StatusIcon s={active.status} /> {label(active.status)}</span>}
              subtitle={`${active.parentId ? "Follow-up · " : ""}${new Date(active.createdAt).toLocaleString()}`}
              action={isRunning ? <Button variant="secondary" onClick={() => cancel(active.id)} className="px-2.5 py-1.5 text-xs"><Square className="h-3.5 w-3.5" /> Cancel</Button> : undefined}
            >
              <details className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <summary className="cursor-pointer font-medium">Request</summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans">{active.input}</pre>
              </details>

              {isRunning && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(live?.activity.length ? live.activity : ["Starting the agent"]).slice(-6).map((a, i, arr) => (
                      <span key={i} className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", i === arr.length - 1 ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500")}>
                        {i === arr.length - 1 && <Loader2 className="h-3 w-3 animate-spin" />} {a}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Research can take a few minutes. You can leave this page — the task keeps running and its result is saved.</p>
                  {live?.text && <div className="rounded-xl border border-slate-200 p-4 opacity-80"><Markdown text={live.text} /></div>}
                </div>
              )}

              {active.status === "failed" && <ErrorBanner message={active.error || "The research agent could not complete this task."} />}
              {active.status === "cancelled" && <p className="text-sm text-slate-500">This task was cancelled.</p>}
              {active.status === "incomplete" && <div className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">The agent stopped before finishing ({active.incompleteReason ?? "limit reached"}). The partial result is below; use Continue to let it finish.</div>}

              {!isRunning && active.answer && <ImportProspects answer={active.answer} />}
              {!isRunning && active.answer && <div className="rounded-xl border border-slate-200 p-5"><Markdown text={active.answer} /></div>}

              {!isRunning && active.files.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Files</div>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {active.files.map((f) => (
                      <li key={f.path} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="flex-1 truncate font-mono text-xs text-slate-700">{f.path}</span>
                        <span className="text-xs text-slate-400">{fmtBytes(f.bytes)}</span>
                        <a href={`/api/agent-tasks/${active.id}/files?path=${encodeURIComponent(f.path)}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"><Download className="h-3.5 w-3.5" /> Download</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {active.canContinue && (
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600"><CornerDownRight className="h-3.5 w-3.5" /> Continue this result (revise, answer its questions, add details)</label>
                  <div className="flex gap-2">
                    <input className={inputCls} placeholder="e.g. Make the post shorter and focus on dental clinics" value={followUp} onChange={(e) => { setFollowUp(e.target.value); setConsent(false); }} onKeyDown={(e) => e.key === "Enter" && followUp.trim() && !anyRunning && (!followWantsPublish || consent) && submit(followUp, active.id)} />
                    <Button onClick={() => submit(followUp, active.id)} loading={submitting && !!followUp} disabled={!followUp.trim() || !!anyRunning || (followWantsPublish && !consent)}>Continue</Button>
                  </div>
                  {followWantsPublish && (
                    <label className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <input type="checkbox" className="mt-0.5 h-4 w-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                      <span>This follow-up asks the agent to publish or schedule on your connected accounts. I confirm.</span>
                    </label>
                  )}
                  <p className="mt-1 text-[11px] text-slate-400">A follow-up carries the earlier context, so it costs more than a new request.</p>
                </div>
              )}
            </Card>
          ) : (
            tasks && <Card><EmptyState icon={<Bot className="h-5 w-5" />} title="No research yet" body="Run the agent to get prioritized prospects with evidence and a publish-ready LinkedIn draft." /></Card>
          )}
        </div>

        <Card title={<span className="flex items-center gap-1.5"><History className="h-4 w-4 text-slate-400" /> Your tasks</span>} className="xl:sticky xl:top-20 xl:self-start">
          {!tasks ? (
            <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
          ) : tasks.length === 0 ? (
            <p className="text-xs text-slate-400">Tasks you run appear here.</p>
          ) : (
            <ul className="-mx-2 space-y-1">
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => {
                      setActiveId(t.id);
                      if (!TERMINAL.has(t.status)) follow(t.id);
                    }}
                    className={cx("w-full rounded-lg px-2 py-2 text-left transition hover:bg-slate-50", t.id === activeId && "bg-brand-50/70")}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800"><StatusIcon s={t.status} small /> {t.parentId ? "↳ " : ""}{firstLine(t.input)}</div>
                    <div className="mt-0.5 pl-5 text-[11px] text-slate-400">{new Date(t.createdAt).toLocaleString()}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function ImportProspects({ answer }: { answer: string }) {
  const { prospects, addProspects, brand } = useStore();
  const rows = parseProspectTable(answer);
  const known = new Set(prospects.map((p) => p.company.toLowerCase()));
  const fresh = rows.filter((r) => !known.has(r.name.toLowerCase()));
  if (!rows.length) return null;
  const add = () => {
    const ps: Prospect[] = fresh.map((r) => {
      const industry = brand.targetIndustries.find((i) => `${r.fit} ${r.signal}`.toLowerCase().includes(i.toLowerCase())) ?? "Unknown";
      const p: Prospect = {
        id: `p-disc-${uid()}`,
        company: r.name,
        website: "",
        industry,
        size: 0,
        location: "—",
        notes: [`Discovered by the Research Agent.`, r.fit && `Fit: ${r.fit}.`, r.nextStep && `Suggested next step: ${r.nextStep}.`].filter(Boolean).join(" "),
        signals: r.signal ? [r.signal] : [],
        dealValue: brand.avgDealValue,
        status: "new",
        source: { kind: "research-agent", url: r.evidenceUrl, date: r.evidenceDate, confidence: r.confidence },
      };
      p.score = finalize(ruleScore(p, brand), 0, "Rule-based signal score from the agent's verified buying signal.", "rules");
      return p;
    });
    addProspects(ps);
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <span className="flex-1">The agent found <b>{rows.length}</b> prospect{rows.length > 1 ? "s" : ""} with evidence.{fresh.length < rows.length && ` ${rows.length - fresh.length} already in your pipeline.`}</span>
      {fresh.length > 0 ? (
        <Button variant="success" onClick={add}>Add {fresh.length} to pipeline</Button>
      ) : (
        <Link href="/autopilot" className="text-xs font-semibold underline">All added — run Autopilot on them →</Link>
      )}
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-agent text-sm text-slate-700">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a> }}>
        {text.replace(/<br\s*\/?>/gi, " · ")}
      </ReactMarkdown>
    </div>
  );
}

function StatusIcon({ s, small }: { s: Status; small?: boolean }) {
  const c = small ? "h-3.5 w-3.5" : "h-4 w-4";
  if (s === "completed") return <CheckCircle2 className={cx(c, "text-emerald-600")} />;
  if (s === "failed" || s === "cancelled") return <XCircle className={cx(c, "text-rose-500")} />;
  if (s === "incomplete") return <XCircle className={cx(c, "text-amber-500")} />;
  return <Loader2 className={cx(c, "animate-spin text-brand-600")} />;
}

const label = (s: Status) => ({ starting: "Starting…", in_progress: "Researching…", completed: "Completed", incomplete: "Stopped early", failed: "Failed", cancelled: "Cancelled" })[s];
const firstLine = (s: string) => {
  const l = s.split("\n").find((x) => x.trim()) ?? "";
  return l.length > 42 ? `${l.slice(0, 42)}…` : l;
};
const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
