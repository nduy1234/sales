import type { ContentPost, Prospect, UsageRecord } from "./types";

// Funnel assumptions for projections. Editable in the dashboard; never presented as actual revenue.
export interface Assumptions {
  replyRate: number; // reply rate for a score-50 lead (scaled by intent score)
  meetingRate: number; // replies -> meetings
  closeRate: number; // meetings -> closed deals
  hourlyRate: number; // value of the owner's time, USD/hour
}
export const DEFAULT_ASSUMPTIONS: Assumptions = { replyRate: 0.1, meetingRate: 0.5, closeRate: 0.3, hourlyRate: 60 };

// Manual time per task an owner would otherwise spend (minutes).
export const MINUTES_SAVED: Record<string, number> = { research: 20, score: 5, outreach: 12, linkedin: 25, xpost: 10, recommendations: 10 };

/** Probability a prospect closes, from the intent score and funnel assumptions. */
export function winProbability(score: number, a: Assumptions = DEFAULT_ASSUMPTIONS) {
  const reply = Math.min(0.9, a.replyRate * (score / 50));
  return reply * a.meetingRate * a.closeRate;
}

export function revenueImpact(prospects: Prospect[], posts: ContentPost[], usage: UsageRecord[], a: Assumptions = DEFAULT_ASSUMPTIONS) {
  const engaged = prospects.filter((p) => p.outreach?.approved);
  const pipeline = engaged.reduce((s, p) => s + p.dealValue, 0);
  const expected = engaged.reduce((s, p) => s + p.dealValue * winProbability(p.score?.score ?? 0, a), 0);
  const drafted = prospects.filter((p) => p.outreach && !p.outreach.approved);
  const pendingExpected = drafted.reduce((s, p) => s + p.dealValue * winProbability(p.score?.score ?? 0, a), 0);
  const aiCost = usage.reduce((s, u) => s + u.cost, 0);
  const minutes = usage.filter((u) => !u.cached).reduce((s, u) => s + (MINUTES_SAVED[u.task] ?? 0), 0);
  const hoursSaved = minutes / 60;
  return {
    engaged: engaged.length,
    pipeline,
    expected,
    pendingExpected,
    aiCost,
    hoursSaved,
    timeValue: hoursSaved * a.hourlyRate,
    roi: aiCost > 0 ? (expected + hoursSaved * a.hourlyRate) / aiCost : 0,
    scheduledPosts: posts.filter((p) => p.status === "scheduled" || p.status === "published").length,
  };
}
