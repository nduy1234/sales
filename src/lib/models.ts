import type { ModelInfo, TaskKind, Tier } from "./types";

// Default catalog. Prices are public list-price estimates (USD / 1M tokens) used to
// estimate cost from the token counts TokenRouter returns. IDs can be overridden by env.
export const DEFAULT_MODELS: ModelInfo[] = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "economy", quality: 1, inPer1M: 0.15, outPer1M: 0.6 },
  { id: "openai/gpt-5-mini", label: "GPT-5 mini", tier: "balanced", quality: 2, inPer1M: 0.25, outPer1M: 2.0 },
  { id: "openai/gpt-5.4", label: "GPT-5.4", tier: "premium", quality: 3, inPer1M: 2.5, outPer1M: 15.0 },
];

export interface TaskSpec {
  label: string;
  complexity: 1 | 2 | 3;
  maxTokens: number;
  why: string;
}

// Complexity = minimum model quality needed. Router picks the cheapest model that meets it.
export const TASKS: Record<TaskKind, TaskSpec> = {
  research: { label: "Prospect research", complexity: 1, maxTokens: 700, why: "Extraction & summarization of supplied facts" },
  score: { label: "Intent scoring", complexity: 1, maxTokens: 250, why: "Rules compute the score; model only adjusts ±10 and explains" },
  recommendations: { label: "Daily plan", complexity: 1, maxTokens: 500, why: "Short structured list from dashboard stats" },
  outreach: { label: "Personalized outreach", complexity: 2, maxTokens: 500, why: "Persuasive writing needs a mid-tier model" },
  xpost: { label: "X post / thread", complexity: 1, maxTokens: 400, why: "Short-form copy under tight length limits; an economy model handles it" },
  linkedin: { label: "LinkedIn post", complexity: 2, maxTokens: 800, why: "Brand-voice copywriting needs a mid-tier model" },
};

export function selectModel(task: TaskKind, catalog: ModelInfo[], premium = false, minQuality = 0) {
  const spec = TASKS[task];
  const need = Math.min(3, Math.max(spec.complexity + (premium ? 1 : 0), minQuality)) as 1 | 2 | 3;
  const sorted = [...catalog].sort((a, b) => a.inPer1M + a.outPer1M - (b.inPer1M + b.outPer1M));
  const model = sorted.find((m) => m.quality >= need) ?? sorted[sorted.length - 1];
  const reason =
    `${spec.why}. Needs quality ≥${need}${premium ? " (premium requested)" : ""}; ` +
    `${model.label} is the cheapest model that qualifies.`;
  return { model, reason };
}

export function priceOf(m: ModelInfo, promptTokens: number, completionTokens: number) {
  return (promptTokens * m.inPer1M + completionTokens * m.outPer1M) / 1_000_000;
}

export function baselineModel(catalog: ModelInfo[]) {
  return [...catalog].sort((a, b) => b.quality - a.quality || b.outPer1M - a.outPer1M)[0];
}

export function nextTier(t: Tier): Tier | null {
  return t === "economy" ? "balanced" : t === "balanced" ? "premium" : null;
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}
