"use client";

import { CalendarClock, CalendarDays, CheckCircle2, Crown, ExternalLink, PenSquare, Settings2, ShieldCheck, Wand2, X as XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CopyButton, EmptyState, ErrorBanner, ModelBadge, PageHeader, Skeleton, cx, inputCls } from "@/components/ui";
import { priceOf, selectModel } from "@/lib/models";
import { autoSchedule, composeUrl, fullText, isDue, platformLabel } from "@/lib/schedule";
import { fmtUsd, useStore } from "@/lib/store";
import type { ContentPost, Platform, UsageRecord } from "@/lib/types";
import { useAgent } from "@/lib/useAgent";

const IDEAS = ["3 signs your website is costing you bookings", "What local SEO actually means for a 10-person business", "Why we tell clients to delete half their homepage", "The 60-second mobile test every owner should run"];

export default function ContentPage() {
  const { posts, updatePost, status, brand, setBrand } = useStore();
  const agent = useAgent();
  const [topic, setTopic] = useState(IDEAS[0]);
  const [platforms, setPlatforms] = useState<Platform[]>(["linkedin", "x"]);
  const [premium, setPremium] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [usageById, setUsageById] = useState<Record<string, UsageRecord>>({});
  const [showBrand, setShowBrand] = useState(false);
  const [filter, setFilter] = useState<"all" | Platform>("all");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const est = useMemo(() => {
    if (!status) return null;
    return platforms.map((pl) => {
      const { model } = selectModel(pl === "x" ? "xpost" : "linkedin", status.catalog, premium);
      return { pl, model, cost: priceOf(model, 350, pl === "x" ? 220 : 450) };
    });
  }, [status, premium, platforms]);

  async function generate() {
    if (!platforms.length) return;
    setBusy(true);
    setErr(null);
    try {
      for (const pl of platforms) {
        const r = await agent.post(topic.trim() || IDEAS[0], undefined, premium, pl);
        if (r.usage) setUsageById((m) => ({ ...m, [r.data.id]: r.usage! }));
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function approveAndSchedule(p: ContentPost) {
    const approved = { ...p, status: "approved" as const };
    const slot = autoSchedule([approved, ...posts.filter((x) => x.id !== p.id)], new Date())[p.id];
    updatePost(p.id, slot ? { status: "scheduled", scheduledFor: slot } : { status: "approved" });
  }

  function scheduleAllApproved() {
    const slots = autoSchedule(posts, new Date());
    for (const [id, at] of Object.entries(slots)) updatePost(id, { status: "scheduled", scheduledFor: at });
  }

  const shown = posts.filter((p) => filter === "all" || (p.platform ?? "linkedin") === filter);
  const approvedUnscheduled = posts.filter((p) => p.status === "approved" && !p.scheduledFor).length;
  const due = posts.filter((p) => isDue(p, now));

  return (
    <div>
      <PageHeader
        title="AI Content Studio"
        subtitle="Brand-consistent, SEO-aware posts for LinkedIn and X, scheduled into the best posting windows after your approval."
        action={<Button variant="secondary" onClick={() => setShowBrand(!showBrand)}><Settings2 className="h-4 w-4" /> Brand voice</Button>}
      />

      {showBrand && (
        <Card className="mb-6" title="Brand profile" subtitle="Used in every prompt (trimmed to keep prompts small)">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Business name"><input className={inputCls} value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} /></Field>
            <Field label="Target industries (comma separated)"><input className={inputCls} value={brand.targetIndustries.join(", ")} onChange={(e) => setBrand({ ...brand, targetIndustries: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></Field>
            <Field label="Offer"><textarea rows={2} className={inputCls} value={brand.offer} onChange={(e) => setBrand({ ...brand, offer: e.target.value })} /></Field>
            <Field label="Ideal customer"><textarea rows={2} className={inputCls} value={brand.icp} onChange={(e) => setBrand({ ...brand, icp: e.target.value })} /></Field>
            <Field label="Voice & tone" className="md:col-span-2"><textarea rows={2} className={inputCls} value={brand.voice} onChange={(e) => setBrand({ ...brand, voice: e.target.value })} /></Field>
          </div>
        </Card>
      )}

      {due.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <CalendarClock className="h-4 w-4" />
          <span className="flex-1"><b>{due.length}</b> scheduled post{due.length > 1 ? "s are" : " is"} due. Open the composer to publish — RevenuePilot never posts without you.</span>
        </div>
      )}

      <Calendar posts={posts} now={now} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card title="New post">
            <div className="space-y-3">
              <Field label="Topic">
                <textarea rows={3} className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {IDEAS.map((i) => <button key={i} onClick={() => setTopic(i)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-brand-300 hover:text-brand-700">{i}</button>)}
              </div>
              <div>
                <div className="mb-1.5 text-xs font-medium text-slate-600">Platforms</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["linkedin", "x"] as Platform[]).map((pl) => {
                    const on = platforms.includes(pl);
                    return (
                      <button key={pl} onClick={() => setPlatforms(on ? platforms.filter((x) => x !== pl) : [...platforms, pl])} className={cx("flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium", on ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500")}>
                        {on && <CheckCircle2 className="h-3.5 w-3.5" />} {platformLabel(pl)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1">
                <button onClick={() => setPremium(false)} className={cx("rounded-lg px-3 py-2 text-xs font-medium", !premium ? "bg-white text-slate-900 shadow-card" : "text-slate-500")}>Standard</button>
                <button onClick={() => setPremium(true)} className={cx("flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium", premium ? "bg-white text-violet-700 shadow-card" : "text-slate-500")}><Crown className="h-3.5 w-3.5" /> Premium</button>
              </div>
              {est && est.length > 0 && (
                <div className="space-y-1 rounded-xl border border-slate-200 p-3 text-xs">
                  <div className="text-slate-500">Router will use</div>
                  {est.map((e) => (
                    <div key={e.pl} className="flex justify-between"><span><b className="text-slate-800">{platformLabel(e.pl)}</b> → {e.model.label}</span><span className="font-mono text-slate-700">≈{fmtUsd(e.cost)}</span></div>
                  ))}
                </div>
              )}
              <Button onClick={generate} loading={busy} disabled={!platforms.length} className="w-full py-2.5"><Wand2 className="h-4 w-4" /> Generate {platforms.length > 1 ? `${platforms.length} posts` : "post"}</Button>
              {err && <ErrorBanner message={err} onRetry={generate} />}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
              {(["all", "linkedin", "x"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={cx("rounded-md px-3 py-1 text-xs font-medium", filter === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>{f === "all" ? "All" : platformLabel(f)}</button>
              ))}
            </div>
            <div className="flex-1" />
            {approvedUnscheduled > 0 && <Button variant="secondary" onClick={scheduleAllApproved}><CalendarDays className="h-4 w-4" /> Schedule {approvedUnscheduled} approved</Button>}
          </div>

          {busy && <Card><Skeleton lines={7} /></Card>}
          {shown.length === 0 && !busy ? (
            <Card><EmptyState icon={<PenSquare className="h-5 w-5" />} title="No posts yet" body="Pick a topic and generate on-brand posts for LinkedIn and X." /></Card>
          ) : (
            shown.map((p) => <PostCard key={p.id} p={p} now={now} usage={usageById[p.id]} onUpdate={(patch) => updatePost(p.id, patch)} onApproveSchedule={() => approveAndSchedule(p)} />)
          )}
        </div>
      </div>
    </div>
  );
}

function PostCard({ p, now, usage, onUpdate, onApproveSchedule }: { p: ContentPost; now: Date; usage?: UsageRecord; onUpdate: (x: Partial<ContentPost>) => void; onApproveSchedule: () => void }) {
  const platform = p.platform ?? "linkedin";
  const xOver = platform === "x" ? p.body.split(/\n\n/).filter((t) => t.length > 280).length : 0;
  const due = isDue(p, now);
  const localValue = p.scheduledFor ? toLocalInput(p.scheduledFor) : "";
  return (
    <Card
      title={<span className="flex items-center gap-2"><PlatformBadge p={platform} /> {p.topic}</span>}
      subtitle={new Date(p.createdAt).toLocaleString()}
      action={<StatusPill p={p} due={due} />}
    >
      <div className="grid gap-5 md:grid-cols-[1fr_220px]">
        <div>
          <textarea className={cx("w-full resize-y rounded-xl border border-slate-200 p-3 text-sm text-slate-700 focus:border-brand-300 focus:outline-none", platform === "x" ? "h-40" : "h-56")} value={p.body} disabled={p.status === "published"} onChange={(e) => onUpdate({ body: e.target.value, status: "draft", scheduledFor: undefined })} />
          {platform === "x" && <p className={cx("mt-1 text-[11px]", xOver ? "text-rose-600" : "text-slate-400")}>{p.body.split(/\n\n/).length} tweet(s), separated by blank lines{xOver ? ` · ${xOver} over 280 chars` : " · all within 280 chars"}</p>}
          <p className="mt-2 text-sm text-brand-600">{p.hashtags.map((h) => `#${h}`).join(" ")}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {p.status === "draft" && (
              <>
                <Button variant="success" onClick={onApproveSchedule} disabled={xOver > 0}><ShieldCheck className="h-4 w-4" /> Approve & schedule</Button>
                <Button variant="secondary" onClick={() => onUpdate({ status: "approved" })} disabled={xOver > 0}>Approve only</Button>
              </>
            )}
            {(p.status === "approved" || p.status === "scheduled") && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <CalendarClock className="h-4 w-4 text-slate-400" />
                <input type="datetime-local" className="rounded-md border border-slate-200 px-2 py-1 text-xs" value={localValue} onChange={(e) => e.target.value && onUpdate({ status: "scheduled", scheduledFor: new Date(e.target.value).toISOString() })} />
              </label>
            )}
            {p.status === "scheduled" && <Button variant="ghost" onClick={() => onUpdate({ status: "approved", scheduledFor: undefined })}><XIcon className="h-3.5 w-3.5" /> Unschedule</Button>}
            {(p.status === "approved" || p.status === "scheduled") && (
              <>
                <a href={composeUrl(p)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800"><ExternalLink className="h-4 w-4" /> Open in {platformLabel(platform)}</a>
                <Button variant="secondary" onClick={() => onUpdate({ status: "published", publishedAt: new Date().toISOString() })}>Mark published</Button>
              </>
            )}
            <CopyButton text={fullText(p)} />
          </div>
          {platform === "x" && p.body.includes("\n\n") && (p.status === "approved" || p.status === "scheduled") && <p className="mt-1 text-[11px] text-slate-400">X opens with tweet 1 prefilled; copy the rest of the thread as replies.</p>}
          {usage && <div className="mt-3"><ModelBadge usage={usage} /></div>}
        </div>
        <div className="space-y-4 text-xs">
          <div>
            <div className="mb-1.5 font-semibold uppercase tracking-wide text-slate-400">SEO keywords</div>
            <div className="flex flex-wrap gap-1">{p.keywords.map((k) => <span key={k} className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{k}</span>)}</div>
          </div>
          {p.variations.length > 0 && (
            <div>
              <div className="mb-1.5 font-semibold uppercase tracking-wide text-slate-400">Alternative hooks</div>
              <ul className="space-y-1.5">
                {[p.hook, ...p.variations].filter(Boolean).map((v, i) => (
                  <li key={i} className={cx("rounded-lg border p-2", i === 0 ? "border-brand-200 bg-brand-50/50 text-slate-800" : "border-slate-200 text-slate-600")}>
                    {i === 0 && <span className="mr-1 text-[10px] font-semibold text-brand-600">USED</span>}
                    {v}
                    {i > 0 && p.status !== "published" && (
                      <button className="ml-1 text-[10px] font-semibold text-brand-600 hover:underline" onClick={() => onUpdate({ body: p.body.replace(p.hook, v), hook: v, variations: p.variations.map((x) => (x === v ? p.hook : x)), status: "draft", scheduledFor: undefined })}>use</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Calendar({ posts, now }: { posts: ContentPost[]; now: Date }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + i));
  const sched = posts.filter((p) => p.scheduledFor && (p.status === "scheduled" || p.status === "published"));
  return (
    <Card title={<span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-brand-500" /> Next 7 days</span>} subtitle="LinkedIn: Tue–Thu 9:00 · X: weekdays 12:30 (your local time)">
      <div className="-mx-1 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => {
          const items = sched.filter((p) => sameDay(new Date(p.scheduledFor!), d)).sort((a, b) => a.scheduledFor!.localeCompare(b.scheduledFor!));
          return (
            <div key={d.toISOString()} className={cx("min-h-[92px] rounded-xl border p-2", sameDay(d, now) ? "border-brand-200 bg-brand-50/40" : "border-slate-100 bg-slate-50/50")}>
              <div className="mb-1.5 text-[11px] font-semibold text-slate-500">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</div>
              <div className="space-y-1">
                {items.map((p) => (
                  <div key={p.id} title={p.topic} className={cx("truncate rounded-md px-1.5 py-1 text-[10px] font-medium", p.status === "published" ? "bg-emerald-100 text-emerald-800" : isDue(p, now) ? "bg-amber-100 text-amber-800" : (p.platform ?? "linkedin") === "x" ? "bg-slate-900 text-white" : "bg-sky-100 text-sky-800")}>
                    {new Date(p.scheduledFor!).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {platformLabel(p.platform)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PlatformBadge({ p }: { p: Platform }) {
  return <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-bold", p === "x" ? "bg-slate-900 text-white" : "bg-sky-600 text-white")}>{platformLabel(p)}</span>;
}

function StatusPill({ p, due }: { p: ContentPost; due: boolean }) {
  if (p.status === "published") return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Published{p.publishedAt ? ` ${new Date(p.publishedAt).toLocaleDateString()}` : ""}</span>;
  if (p.status === "scheduled") return <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", due ? "bg-amber-100 text-amber-800" : "bg-indigo-50 text-indigo-700")}>{due ? "Due now" : `Scheduled ${new Date(p.scheduledFor!).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`}</span>;
  if (p.status === "approved") return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"><ShieldCheck className="h-3 w-3" /> Approved</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Draft</span>;
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
