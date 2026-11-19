"use client";

import { ExternalLink, Inbox, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { autoSchedule, platformLabel } from "@/lib/schedule";
import { fmtMoney, useStore } from "@/lib/store";
import { winProbability } from "@/lib/revenue";
import { bump } from "@/lib/useAgent";
import type { ContentPost, Prospect } from "@/lib/types";
import { Button, Card, EmptyState, ScoreBadge, cx } from "./ui";

// Everything the agent produced that still needs a human decision. Nothing is sent or posted from here.
export function ApprovalQueue({ compact = false }: { compact?: boolean }) {
  const { prospects, posts, updateProspect, updatePost, assumptions } = useStore();
  const outreach = prospects.filter((p) => p.outreach && !p.outreach.approved);
  const drafts = posts.filter((p) => p.status === "draft");
  const total = outreach.length + drafts.length;

  const approveOutreach = (p: Prospect) => updateProspect(p.id, { outreach: { ...p.outreach!, approved: true }, status: bump(p.status, "approved") });
  const approvePosts = (list: ContentPost[]) => {
    const approved = posts.map((p) => (list.some((x) => x.id === p.id) ? { ...p, status: "approved" as const } : p));
    const slots = autoSchedule(approved, new Date());
    for (const p of list) updatePost(p.id, slots[p.id] ? { status: "scheduled", scheduledFor: slots[p.id] } : { status: "approved" });
  };

  return (
    <Card
      title={<span className="flex items-center gap-1.5"><Inbox className="h-4 w-4 text-brand-500" /> Approval queue {total > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{total}</span>}</span>}
      subtitle="The agent drafts; you decide. Approved posts are auto-scheduled into the next posting window."
      action={total > 1 ? <Button variant="success" className="px-2.5 py-1.5 text-xs" onClick={() => { outreach.forEach(approveOutreach); approvePosts(drafts); }}><ShieldCheck className="h-3.5 w-3.5" /> Approve all</Button> : undefined}
    >
      {total === 0 ? (
        <EmptyState title="Nothing waiting" body="Run Autopilot to fill the queue with outreach and content drafts." />
      ) : (
        <ul className="divide-y divide-slate-100">
          {outreach.slice(0, compact ? 4 : 50).map((p) => (
            <li key={p.id} className="flex items-start gap-3 py-3">
              <span className="mt-0.5 rounded-lg bg-sky-50 p-1.5 text-sky-600"><Send className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">Email to {p.company} <ScoreBadge score={p.score} /></div>
                <div className="truncate text-xs text-slate-500">{p.outreach!.subject} — {p.outreach!.message.split("\n").find((l) => l.trim() && !/^hi\b/i.test(l))?.slice(0, 90)}</div>
                <div className="mt-0.5 text-[11px] text-emerald-700">Projected value {fmtMoney(p.dealValue * winProbability(p.score?.score ?? 0, assumptions))}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {!compact && <Link href="/prospects" className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">Edit</Link>}
                <Button variant="success" className="px-2.5 py-1.5 text-xs" onClick={() => approveOutreach(p)}>Approve</Button>
              </div>
            </li>
          ))}
          {drafts.slice(0, compact ? 4 : 50).map((p) => (
            <li key={p.id} className="flex items-start gap-3 py-3">
              <span className={cx("mt-0.5 rounded-md px-1.5 py-1 text-[10px] font-bold text-white", (p.platform ?? "linkedin") === "x" ? "bg-slate-900" : "bg-sky-600")}>{platformLabel(p.platform)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-900">{p.hook || p.topic}</div>
                <div className="truncate text-xs text-slate-500">{p.topic}</div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {!compact && <Link href="/content" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100"><ExternalLink className="h-3 w-3" />Edit</Link>}
                <Button variant="success" className="px-2.5 py-1.5 text-xs" onClick={() => approvePosts([p])}>Approve & schedule</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
