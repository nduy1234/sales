import type { Brand, Prospect, Score } from "./types";

// Deterministic, zero-cost intent signals. The LLM only nudges this score.
const RULES: { re: RegExp; label: string; weight: number }[] = [
  { re: /no website|outdated|not mobile|slow (site|website)|broken/i, label: "Weak web presence", weight: 18 },
  { re: /hiring|job post|recruit/i, label: "Actively hiring", weight: 15 },
  { re: /expan|new location|opening|second location|2nd location/i, label: "Expanding", weight: 15 },
  { re: /fund|raised|grant|investment/i, label: "New funding", weight: 12 },
  { re: /running ads|ad spend|google ads|meta ads|paid/i, label: "Spending on ads", weight: 10 },
  { re: /review|complain|booking/i, label: "Customer-experience pain", weight: 8 },
  { re: /competitor|losing/i, label: "Competitive pressure", weight: 8 },
  { re: /page[- ]?2|rank|seo|visibility/i, label: "Search visibility gap", weight: 12 },
  { re: /launch|rebrand|seasonal/i, label: "Upcoming launch/season", weight: 8 },
];

export function ruleScore(p: Prospect, brand: Brand, extraSignals: string[] = []): Omit<Score, "rationale" | "source" | "adjustment"> {
  const text = [...p.signals, ...extraSignals, p.notes].join(" | ");
  const signals: { label: string; weight: number }[] = [];
  for (const r of RULES) if (r.re.test(text)) signals.push({ label: r.label, weight: r.weight });
  if (p.size >= 5 && p.size <= 200) signals.push({ label: "ICP company size", weight: 10 });
  if (brand.targetIndustries.some((i) => p.industry.toLowerCase().includes(i.toLowerCase())))
    signals.push({ label: "Target industry", weight: 12 });
  // Diminishing scale + cap so rules alone never claim certainty; AI can add up to +10.
  const base = Math.min(92, clamp(15 + signals.reduce((s, x) => s + x.weight, 0) * 0.85));
  return { score: base, base, tier: tierOf(base), signals };
}

export function finalize(base: Omit<Score, "rationale" | "source" | "adjustment">, adjustment: number, rationale: string, source: Score["source"], bestTiming?: string): Score {
  const adj = Math.max(-10, Math.min(10, Math.round(adjustment) || 0));
  const score = clamp(base.base + adj);
  return { ...base, score, tier: tierOf(score), adjustment: adj, rationale, source, bestTiming };
}

export const tierOf = (s: number): Score["tier"] => (s >= 75 ? "Hot" : s >= 50 ? "Warm" : "Cold");
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
