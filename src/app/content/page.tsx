"use client";

import { Crown, PenSquare, Settings2, ShieldCheck, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CopyButton, EmptyState, ErrorBanner, ModelBadge, PageHeader, Skeleton, cx, inputCls } from "@/components/ui";
import { selectModel, priceOf } from "@/lib/models";
import { fmtUsd, useStore } from "@/lib/store";
import { useAgent } from "@/lib/useAgent";
import type { UsageRecord } from "@/lib/types";

const IDEAS = ["3 signs your website is costing you bookings", "What local SEO actually means for a 10-person business", "Why we tell clients to delete half their homepage", "The 60-second mobile test every owner should run"];

export default function ContentPage() {
  const { posts, updatePost, status, brand, setBrand } = useStore();
  const agent = useAgent();
  const [topic, setTopic] = useState(IDEAS[0]);
  const [premium, setPremium] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [usageById, setUsageById] = useState<Record<string, UsageRecord>>({});
  const [showBrand, setShowBrand] = useState(false);

  const route = useMemo(() => {
    if (!status) return null;
    const { model } = selectModel("linkedin", status.catalog, premium);
    // Typical size of this task: ~350 prompt + ~450 completion tokens.
    return { model, est: priceOf(model, 350, 450) };
  }, [status, premium]);

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const r = await agent.post(topic.trim() || IDEAS[0], undefined, premium);
      if (r.usage) setUsageById((m) => ({ ...m, [r.data.id]: r.usage! }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="AI Content Studio" subtitle="Daily LinkedIn posts with hooks, hashtags, SEO keywords and variations — in your brand voice." action={<Button variant="secondary" onClick={() => setShowBrand(!showBrand)}><Settings2 className="h-4 w-4" /> Brand voice</Button>} />

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

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card title="New post">
            <div className="space-y-3">
              <Field label="Topic">
                <textarea rows={3} className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-1.5">
                {IDEAS.map((i) => <button key={i} onClick={() => setTopic(i)} className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-brand-300 hover:text-brand-700">{i}</button>)}
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1">
                <button onClick={() => setPremium(false)} className={cx("rounded-lg px-3 py-2 text-xs font-medium", !premium ? "bg-white text-slate-900 shadow-card" : "text-slate-500")}>Standard</button>
                <button onClick={() => setPremium(true)} className={cx("flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-xs font-medium", premium ? "bg-white text-violet-700 shadow-card" : "text-slate-500")}><Crown className="h-3.5 w-3.5" /> Premium</button>
              </div>
              {route && (
                <div className="rounded-xl border border-slate-200 p-3 text-xs">
                  <div className="text-slate-500">Router will use</div>
                  <div className="mt-0.5 font-semibold text-slate-900">{route.model.label} <span className="font-normal text-slate-400">({route.model.tier})</span></div>
                  <div className="mt-1 text-slate-500">Est. ≈ <span className="font-mono text-slate-800">{fmtUsd(route.est)}</span> per post</div>
                </div>
              )}
              <Button onClick={generate} loading={busy} className="w-full py-2.5"><Wand2 className="h-4 w-4" /> Generate post</Button>
              {err && <ErrorBanner message={err} onRetry={generate} />}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {busy && <Card><Skeleton lines={7} /></Card>}
          {posts.length === 0 && !busy ? (
            <Card><EmptyState icon={<PenSquare className="h-5 w-5" />} title="No posts yet" body="Pick a topic and generate your first on-brand LinkedIn post." /></Card>
          ) : (
            posts.map((p) => (
              <Card key={p.id} title={p.topic} subtitle={new Date(p.createdAt).toLocaleString()} action={p.status === "approved" ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"><ShieldCheck className="h-3 w-3" /> Approved</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">Draft</span>}>
                <div className="grid gap-5 md:grid-cols-[1fr_220px]">
                  <div>
                    <textarea className="h-56 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm text-slate-700 focus:border-brand-300 focus:outline-none" value={p.body} onChange={(e) => updatePost(p.id, { body: e.target.value, status: "draft" })} />
                    <p className="mt-2 text-sm text-brand-600">{p.hashtags.map((h) => `#${h}`).join(" ")}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.status !== "approved" && <Button variant="success" onClick={() => updatePost(p.id, { status: "approved" })}><ShieldCheck className="h-4 w-4" /> Approve</Button>}
                      <CopyButton text={`${p.body}\n\n${p.hashtags.map((h) => `#${h}`).join(" ")}`} />
                    </div>
                    {usageById[p.id] && <div className="mt-3"><ModelBadge usage={usageById[p.id]} /></div>}
                  </div>
                  <div className="space-y-4 text-xs">
                    <div>
                      <div className="mb-1.5 font-semibold uppercase tracking-wide text-slate-400">SEO keywords</div>
                      <div className="flex flex-wrap gap-1">{p.keywords.map((k) => <span key={k} className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{k}</span>)}</div>
                    </div>
                    <div>
                      <div className="mb-1.5 font-semibold uppercase tracking-wide text-slate-400">Alternative hooks</div>
                      <ul className="space-y-1.5">
                        {[p.hook, ...p.variations].filter(Boolean).map((v, i) => (
                          <li key={i} className={cx("rounded-lg border p-2", i === 0 ? "border-brand-200 bg-brand-50/50 text-slate-800" : "border-slate-200 text-slate-600")}>
                            {i === 0 && <span className="mr-1 text-[10px] font-semibold text-brand-600">USED</span>}
                            {v}
                            {i > 0 && (
                              <button className="ml-1 text-[10px] font-semibold text-brand-600 hover:underline" onClick={() => updatePost(p.id, { body: p.body.replace(p.hook, v), hook: v, variations: p.variations.map((x) => (x === v ? p.hook : x)), status: "draft" })}>
                                use
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
