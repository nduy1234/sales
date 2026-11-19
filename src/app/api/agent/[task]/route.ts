import { NextResponse } from "next/server";
import { AgentError, fetchSiteText, runTask } from "@/lib/llm";
import { TASKS } from "@/lib/models";
import { finalize, ruleScore } from "@/lib/scoring";
import type { Payload } from "@/lib/tasks";
import type { Outreach, Recommendation, Research, TaskKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const arr = (v: unknown, n = 6): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, n) : []);
const str = (v: unknown, d = "") => (typeof v === "string" ? v.trim() : d);

export async function POST(req: Request, { params }: { params: { task: string } }) {
  const task = params.task as TaskKind;
  if (!(task in TASKS)) return NextResponse.json({ error: `Unknown task "${params.task}"` }, { status: 404 });

  let body: Payload & { premium?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.brand?.name) return NextResponse.json({ error: "brand is required" }, { status: 400 });
  if (["research", "score", "outreach"].includes(task) && !body.prospect?.company)
    return NextResponse.json({ error: "prospect is required" }, { status: 400 });
  if (task === "outreach" && !body.prospect?.research)
    return NextResponse.json({ error: "Research the prospect before writing outreach" }, { status: 400 });

  try {
    if (task === "research") {
      const siteText = await fetchSiteText(body.prospect!.website);
      const { data, usage } = await runTask(task, { ...body, siteText }, { premium: body.premium });
      const d = data as Record<string, unknown>;
      const research: Research = {
        summary: str(d.summary, "No summary returned."),
        needs: arr(d.needs, 4),
        painPoints: arr(d.painPoints, 4),
        decisionMakers: (Array.isArray(d.decisionMakers) ? d.decisionMakers : [])
          .slice(0, 3)
          .map((x: { title?: unknown; why?: unknown }) => ({ title: str(x?.title, "Decision maker"), why: str(x?.why) })),
        fitReasons: arr(d.fitReasons, 3),
        intentSignals: arr(d.intentSignals, 6),
        sources: [siteText ? `Website (${body.prospect!.website}) — fetched` : "Website not fetched (fictional or unreachable domain)", "Prospect notes & signals you provided"],
      };
      return NextResponse.json({ data: research, usage });
    }

    if (task === "score") {
      const base = ruleScore(body.prospect!, body.brand, body.prospect!.research?.intentSignals);
      const { data, usage } = await runTask(task, body, { premium: body.premium });
      const d = data as Record<string, unknown>;
      const score = finalize(base, Number(d.adjustment) || 0, str(d.rationale, "No rationale returned."), "ai", str(d.bestTiming) || undefined);
      return NextResponse.json({ data: score, usage });
    }

    if (task === "outreach") {
      const { data, usage } = await runTask(task, body, { premium: body.premium });
      const d = data as Record<string, unknown>;
      const outreach: Outreach = { subject: str(d.subject, `Idea for ${body.prospect!.company}`), message: str(d.message), nextSteps: arr(d.nextSteps, 4), approved: false };
      if (!outreach.message) throw new AgentError("Model returned an empty message.");
      return NextResponse.json({ data: outreach, usage });
    }

    if (task === "linkedin") {
      const { data, usage } = await runTask(task, { ...body, topic: str(body.topic) || "Practical marketing advice for local businesses" }, { premium: body.premium });
      const d = data as Record<string, unknown>;
      const post = {
        hook: str(d.hook),
        body: str(d.body),
        hashtags: arr(d.hashtags, 6).map((h) => h.replace(/^#/, "").replace(/\s+/g, "")),
        keywords: arr(d.keywords, 6),
        variations: arr(d.variations, 3),
      };
      if (!post.body) throw new AgentError("Model returned an empty post.");
      return NextResponse.json({ data: post, usage });
    }

    // recommendations
    const { data, usage } = await runTask(task, body, { premium: body.premium });
    const items: Recommendation[] = (Array.isArray((data as { items?: unknown }).items) ? (data as { items: Record<string, unknown>[] }).items : [])
      .slice(0, 5)
      .map((x) => ({
        title: str(x.title, "Action"),
        detail: str(x.detail),
        priority: (["high", "medium", "low"].includes(x.priority as string) ? x.priority : "medium") as Recommendation["priority"],
        action: (["research", "outreach", "content", "followup"].includes(x.action as string) ? x.action : "followup") as Recommendation["action"],
      }));
    return NextResponse.json({ data: items, usage });
  } catch (e) {
    const status = e instanceof AgentError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message || "Agent failed" }, { status });
  }
}
