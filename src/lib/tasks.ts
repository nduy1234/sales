import type { Brand, Prospect, Recommendation, TaskKind } from "./types";
import { ruleScore } from "./scoring";

export type Msg = { role: "system" | "user"; content: string };

export interface Payload {
  brand: Brand;
  prospect?: Prospect;
  topic?: string;
  siteText?: string;
  stats?: { leads: number; hot: number; unresearched: number; awaitingApproval: number; posts: number; top: { company: string; score: number; status: string }[] };
}

const SYS = "You are a precise B2B revenue assistant for a small business. Use only facts provided; never invent names, numbers or events. Reply with one compact JSON object and nothing else.";
const cut = (s: string | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function seller(b: Brand) {
  return `Seller: ${b.name} — ${cut(b.offer, 160)}. ICP: ${cut(b.icp, 160)}.`;
}
function prospectLine(p: Prospect) {
  return `Prospect: ${p.company} | ${p.industry} | ${p.size} employees | ${p.location}. Signals: ${p.signals.join("; ") || "none"}. Notes: ${cut(p.notes, 500)}`;
}

export function buildMessages(task: TaskKind, x: Payload): Msg[] {
  const b = x.brand;
  const p = x.prospect;
  switch (task) {
    case "research":
      return [
        { role: "system", content: SYS },
        {
          role: "user",
          content: `${seller(b)}\n${prospectLine(p!)}\nWebsite text: ${cut(x.siteText, 1800) || "(not available)"}\nReturn JSON: {"summary":"2 sentences","needs":[3 strings],"painPoints":[3 strings],"decisionMakers":[{"title":"likely buyer role","why":"short"}] (2 items, roles only),"fitReasons":[2 strings],"intentSignals":[buying-intent signals found in the facts]}`,
        },
      ];
    case "score": {
      const base = ruleScore(p!, b, p!.research?.intentSignals);
      return [
        { role: "system", content: SYS },
        {
          role: "user",
          content: `${seller(b)}\n${prospectLine(p!)}\nResearch: ${cut(p!.research?.summary, 300)}\nRule-based intent score: ${base.base}/100 from [${base.signals.map((s) => `${s.label} +${s.weight}`).join(", ")}].\nReturn JSON: {"adjustment": integer -10..10 only if facts justify it,"rationale":"1 sentence","bestTiming":"when to reach out, short"}`,
        },
      ];
    }
    case "outreach":
      return [
        { role: "system", content: SYS },
        {
          role: "user",
          content: `${seller(b)}\nBrand voice: ${cut(b.voice, 200)}\n${prospectLine(p!)}\nContact: ${p!.contact ? `${p!.contact.name}, ${p!.contact.title}` : "unknown — address the owner by role"}\nKey needs: ${(p!.research?.needs ?? []).join("; ")}\nWrite a personalized first-touch email under 110 words: open with a specific observation from the facts, one relevant idea, one low-friction CTA. No hype, no fake stats.\nReturn JSON: {"subject":"under 8 words","message":"email body","nextSteps":[3 short follow-up actions]}`,
        },
      ];
    case "linkedin":
      return [
        { role: "system", content: SYS },
        {
          role: "user",
          content: `${seller(b)}\nBrand voice: ${cut(b.voice, 200)}\nTopic: ${cut(x.topic, 200)}${p ? `\nInspired by a ${p.industry} prospect pain (do not name them): ${(p.research?.painPoints ?? p.signals).slice(0, 2).join("; ")}` : ""}\nWrite a LinkedIn post (120-170 words) for small-business owners: scroll-stopping first line, practical insight, soft CTA. No made-up statistics.\nReturn JSON: {"hook":"first line","body":"full post including hook","hashtags":[5 without #],"keywords":[5 SEO keyword phrases],"variations":[2 alternative hooks]}`,
        },
      ];
    case "recommendations":
      return [
        { role: "system", content: SYS },
        {
          role: "user",
          content: `${seller(b)}\nPipeline today: ${JSON.stringify(x.stats)}\nGive today's 4 highest-leverage marketing & sales actions.\nReturn JSON: {"items":[{"title":"imperative, short","detail":"1 sentence referencing the data","priority":"high|medium|low","action":"research|outreach|content|followup"}]}`,
        },
      ];
  }
}

// ---------- Simulated outputs (used only when no TokenRouter key is configured) ----------
export function simulate(task: TaskKind, x: Payload): unknown {
  const b = x.brand;
  const p = x.prospect;
  switch (task) {
    case "research": {
      const sig = p!.signals;
      return {
        summary: `${p!.company} is a ${p!.size}-person ${p!.industry.toLowerCase()} business in ${p!.location}. ${sig.length ? `Recent signals: ${sig.slice(0, 2).join(" and ").toLowerCase()}.` : "No strong recent change signals were found in the provided notes."}`,
        needs: sig.length
          ? [`Turn ${p!.industry.toLowerCase()} search traffic into bookings`, "Modern mobile-friendly website", "Consistent local SEO & reviews"]
          : ["Maintain current visibility", "Occasional content refresh", "No urgent need identified"],
        painPoints: sig.length ? sig.slice(0, 3) : ["No clear pain point in provided data"],
        decisionMakers: [
          { title: p!.contact?.title ?? "Owner / General Manager", why: "Controls marketing budget at this company size" },
          { title: "Office or Operations Manager", why: "Feels booking and phone-volume pain daily" },
        ],
        fitReasons: [
          b.targetIndustries.includes(p!.industry) ? `${p!.industry} is a target industry` : `${p!.industry} is outside core target industries`,
          p!.size <= 200 ? "Company size fits ICP" : "Company likely has in-house marketing",
        ],
        intentSignals: sig,
      };
    }
    case "score": {
      const s = p!.signals.length;
      return {
        adjustment: s >= 3 ? 5 : s === 0 ? -5 : 0,
        rationale: s ? `Multiple concrete signals (${p!.signals.slice(0, 2).join(", ").toLowerCase()}) suggest an active need.` : "Few observable change signals; low urgency.",
        bestTiming: s ? "This week, while the change is fresh" : "Nurture; revisit next quarter",
      };
    }
    case "outreach": {
      const first = p!.contact?.name.replace(/\s*\(sample\)/, "").split(" ").slice(-1)[0] ?? "there";
      const hook = p!.signals[0]?.toLowerCase() ?? "your business";
      return {
        subject: `Quick idea for ${p!.company}`,
        message: `Hi ${p!.contact?.name.startsWith("Dr.") ? `Dr. ${first}` : first},\n\nI noticed ${p!.company} is ${hook.startsWith("opening") || hook.startsWith("hiring") || hook.startsWith("running") ? hook : `dealing with: ${hook}`}. For ${p!.industry.toLowerCase()} teams your size, the fastest win is usually a mobile-first booking page that turns search visits into appointments without extra phone time.\n\nWe help local businesses like yours do exactly that. Would a 15-minute walkthrough of what that could look like for ${p!.location.split(",")[0]} be useful next week?\n\n— ${b.name}`,
        nextSteps: ["Send email Tuesday 9–10am", "Connect on LinkedIn 2 days later with a short note", "Follow up in 5 days with a 1-page mockup"],
      };
    }
    case "linkedin": {
      return {
        hook: "Most small businesses don't have a traffic problem. They have a booking problem.",
        body: `Most small businesses don't have a traffic problem. They have a booking problem.\n\nWe looked at local service sites this month and kept seeing the same pattern: people find you on Google, tap through on their phone, and then hit a wall. A PDF menu. A \"call us\" button during lunch rush. A form that never confirms.\n\nThe fix is rarely a full rebrand. It's three things:\n1. A mobile page that loads fast\n2. One clear action: book, call, or get a quote\n3. Instant confirmation so people don't shop around\n\nIf you're not sure where your site leaks bookings, start by trying to book yourself, on your phone, with one hand.\n\nWhat did you notice?`,
        hashtags: ["SmallBusiness", "LocalSEO", "WebDesign", "CustomerExperience", "Marketing"],
        keywords: ["small business website", "local SEO", "online booking", "mobile website design", "increase bookings"],
        variations: ["Your website isn't losing traffic. It's losing bookings.", "Try booking your own business on your phone. One hand. Go."],
      };
    }
    case "recommendations": {
      const s = x.stats!;
      const items: Recommendation[] = [];
      if (s.top[0]) items.push({ title: `Reach out to ${s.top[0].company}`, detail: `Highest intent score (${s.top[0].score}) and status "${s.top[0].status}".`, priority: "high", action: "outreach" });
      if (s.awaitingApproval) items.push({ title: "Approve pending drafts", detail: `${s.awaitingApproval} outreach draft(s) are waiting for your review.`, priority: "high", action: "followup" });
      if (s.unresearched) items.push({ title: "Research new prospects", detail: `${s.unresearched} prospect(s) have not been researched yet.`, priority: "medium", action: "research" });
      items.push({ title: "Publish one LinkedIn post", detail: s.posts ? `${s.posts} post(s) drafted — schedule the best one.` : "No posts drafted yet; generate today's post.", priority: "medium", action: "content" });
      return { items: items.slice(0, 4) };
    }
  }
}
