"use client";

import { Plus, Search, Send, Target, Trash2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CopyButton, EmptyState, ErrorBanner, List, ModelBadge, PageHeader, ScoreBadge, Skeleton, StageBadge, cx, inputCls } from "@/components/ui";
import { fmtMoney, uid, useStore } from "@/lib/store";
import { bump, useAgent } from "@/lib/useAgent";
import { finalize, ruleScore } from "@/lib/scoring";
import type { Prospect, UsageRecord } from "@/lib/types";

export default function ProspectsPage() {
  const { prospects, ready } = useStore();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"all" | "Hot" | "Warm" | "Cold">("all");
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(
    () =>
      [...prospects]
        .filter((p) => (tier === "all" || p.score?.tier === tier) && `${p.company} ${p.industry} ${p.location}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0)),
    [prospects, q, tier],
  );
  const selected = prospects.find((p) => p.id === sel);

  return (
    <div>
      <PageHeader title="Prospects" subtitle="Research accounts, score buying intent and draft outreach. Results are stored so research is never paid for twice." action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add prospect</Button>} />

      {adding && <AddProspect onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); setSel(id); }} />}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input className={cx(inputCls, "pl-9")} placeholder="Search company, industry, city…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {(["all", "Hot", "Warm", "Cold"] as const).map((t) => (
            <button key={t} onClick={() => setTier(t)} className={cx("rounded-md px-3 py-1 text-xs font-medium", tier === t ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>{t === "all" ? "All" : t}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          {!ready ? (
            <Skeleton lines={6} />
          ) : rows.length === 0 ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title="No prospects match" body="Try another filter or add a prospect." />
          ) : (
            <div className="-m-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/70 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <tr><th className="px-5 py-2.5">Company</th><th className="px-5 py-2.5">Intent</th><th className="hidden px-5 py-2.5 sm:table-cell">Size</th><th className="hidden px-5 py-2.5 md:table-cell">Deal</th><th className="px-5 py-2.5">Stage</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p) => (
                    <tr key={p.id} onClick={() => setSel(p.id)} className={cx("cursor-pointer transition hover:bg-slate-50", sel === p.id && "bg-brand-50/60")}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{p.company}</div>
                        <div className="text-xs text-slate-500">{p.industry} · {p.location}</div>
                      </td>
                      <td className="px-5 py-3"><ScoreBadge score={p.score} /></td>
                      <td className="hidden px-5 py-3 text-slate-600 sm:table-cell">{p.size}</td>
                      <td className="hidden px-5 py-3 font-mono text-slate-700 md:table-cell">{fmtMoney(p.dealValue)}</td>
                      <td className="px-5 py-3"><StageBadge s={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="xl:sticky xl:top-20 xl:self-start">
          {selected ? <Detail key={selected.id} p={selected} onClose={() => setSel(null)} /> : <Card><EmptyState title="Select a prospect" body="Open a prospect to research it, refine its score with AI and draft outreach." /></Card>}
        </div>
      </div>
    </div>
  );
}

function Detail({ p, onClose }: { p: Prospect; onClose: () => void }) {
  const { updateProspect, removeProspect } = useStore();
  const agent = useAgent();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<UsageRecord | undefined>();

  async function act(name: string, fn: () => Promise<{ usage?: UsageRecord }>) {
    setBusy(name);
    setErr(null);
    try {
      const r = await fn();
      setLast(r.usage);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      title={p.company}
      subtitle={`${p.industry} · ${p.size} employees · ${p.location}${p.sample ? " · sample data" : ""}`}
      action={<button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <ScoreBadge score={p.score} size="lg" />
          <span className="font-mono text-sm text-slate-600">{fmtMoney(p.dealValue)} deal</span>
        </div>
        {p.contact && <div className="text-xs text-slate-600">Contact: <span className="font-medium text-slate-800">{p.contact.name}</span>, {p.contact.title}</div>}
        <p className="text-xs text-slate-600">{p.notes}</p>

        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" loading={busy === "r"} disabled={!!busy} onClick={() => act("r", () => agent.research(p, !!p.research))} className="px-2 text-xs"><Search className="h-3.5 w-3.5" />{p.research ? "Re-research" : "Research"}</Button>
          <Button variant="secondary" loading={busy === "s"} disabled={!!busy || !p.research} title={!p.research ? "Research first" : undefined} onClick={() => act("s", () => agent.score(p, true))} className="px-2 text-xs"><Target className="h-3.5 w-3.5" />AI score</Button>
          <Button loading={busy === "o"} disabled={!!busy || !p.research} title={!p.research ? "Research first" : undefined} onClick={() => act("o", () => agent.outreach(p))} className="px-2 text-xs"><Send className="h-3.5 w-3.5" />Outreach</Button>
        </div>
        {last && <ModelBadge usage={last} />}
        {err && <ErrorBanner message={err} />}
        {busy && <Skeleton lines={3} />}

        {p.research && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-700">{p.research.summary}</p>
            <List title="Needs" items={p.research.needs} />
            <List title="Pain points" items={p.research.painPoints} />
            <List title="Likely decision-makers (inferred roles)" items={p.research.decisionMakers.map((d) => `${d.title} — ${d.why}`)} />
            <List title="Intent signals" items={p.research.intentSignals} />
          </div>
        )}

        {p.score && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Why this score</div>
            <p className="text-xs text-slate-600">{p.score.rationale}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.score.signals.map((s) => <span key={s.label} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">{s.label} +{s.weight}</span>)}
              {p.score.source === "ai" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">AI {p.score.adjustment >= 0 ? "+" : ""}{p.score.adjustment}</span>}
            </div>
          </div>
        )}

        {p.outreach && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Outreach draft</div>
            <div className="rounded-xl border border-slate-200 p-3 text-sm">
              <div className="mb-1 text-xs text-slate-500">Subject: <span className="font-medium text-slate-800">{p.outreach.subject}</span></div>
              <textarea className="h-40 w-full resize-y rounded-md border-0 bg-transparent p-0 text-sm text-slate-700 focus:ring-0" value={p.outreach.message} onChange={(e) => updateProspect(p.id, { outreach: { ...p.outreach!, message: e.target.value, approved: false } })} />
            </div>
            <List title="Next steps" items={p.outreach.nextSteps} />
            <div className="flex gap-2">
              {p.outreach.approved ? <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">Approved — send manually</span> : <Button variant="success" onClick={() => updateProspect(p.id, { outreach: { ...p.outreach!, approved: true }, status: bump(p.status, "approved") })}>Approve</Button>}
              <CopyButton text={`Subject: ${p.outreach.subject}\n\n${p.outreach.message}`} />
            </div>
          </div>
        )}

        <button onClick={() => { if (confirm(`Remove ${p.company}?`)) { removeProspect(p.id); onClose(); } }} className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-600"><Trash2 className="h-3 w-3" /> Remove prospect</button>
      </div>
    </Card>
  );
}

function AddProspect({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const { addProspect, brand } = useStore();
  const [f, setF] = useState({ company: "", website: "", industry: "", size: "20", location: "", notes: "", signals: "", contactName: "", contactTitle: "", dealValue: String(brand.avgDealValue) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.company.trim()) return;
    const p: Prospect = {
      id: `p-${uid()}`,
      company: f.company.trim(),
      website: f.website.trim(),
      industry: f.industry.trim() || "Unknown",
      size: Math.max(1, parseInt(f.size) || 1),
      location: f.location.trim() || "—",
      notes: f.notes.trim(),
      signals: f.signals.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      contact: f.contactName.trim() ? { name: f.contactName.trim(), title: f.contactTitle.trim() || "Decision maker" } : undefined,
      dealValue: Math.max(0, parseInt(f.dealValue) || 0),
      status: "new",
    };
    p.score = finalize(ruleScore(p, brand), 0, "Rule-based signal score (no AI run yet).", "rules");
    addProspect(p);
    onAdded(p.id);
  }

  return (
    <Card className="mb-6" title="Add prospect" subtitle="Website text is fetched (free) to ground research when the domain is reachable" action={<button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>}>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input required className={inputCls} placeholder="Company *" value={f.company} onChange={set("company")} />
        <input className={inputCls} placeholder="Website (e.g. acme.com)" value={f.website} onChange={set("website")} />
        <input className={inputCls} placeholder="Industry" value={f.industry} onChange={set("industry")} />
        <input className={inputCls} placeholder="Location" value={f.location} onChange={set("location")} />
        <input className={inputCls} type="number" min={1} placeholder="Employees" value={f.size} onChange={set("size")} />
        <input className={inputCls} type="number" min={0} placeholder="Deal value $" value={f.dealValue} onChange={set("dealValue")} />
        <input className={inputCls} placeholder="Contact name" value={f.contactName} onChange={set("contactName")} />
        <input className={inputCls} placeholder="Contact title" value={f.contactTitle} onChange={set("contactTitle")} />
        <textarea className={cx(inputCls, "sm:col-span-2")} rows={2} placeholder="Signals, comma separated (e.g. hiring, opening new location)" value={f.signals} onChange={set("signals")} />
        <textarea className={cx(inputCls, "sm:col-span-2")} rows={2} placeholder="Notes" value={f.notes} onChange={set("notes")} />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit">Add prospect</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Card>
  );
}
