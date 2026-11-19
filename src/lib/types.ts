export type Tier = "economy" | "balanced" | "premium";
export type TaskKind = "research" | "score" | "outreach" | "linkedin" | "xpost" | "recommendations";
export type Platform = "linkedin" | "x";

export interface ModelInfo {
  id: string;
  label: string;
  tier: Tier;
  quality: 1 | 2 | 3;
  inPer1M: number; // USD per 1M input tokens (list price estimate)
  outPer1M: number; // USD per 1M output tokens (list price estimate)
}

export interface UsageRecord {
  id: string;
  task: TaskKind;
  model: string;
  tier: Tier;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  baselineCost: number; // same tokens priced on the premium model
  latencyMs: number;
  mode: "live" | "simulated";
  cached: boolean;
  escalated: boolean;
  reason: string;
  at: string;
  subject?: string;
}

export interface Brand {
  name: string;
  offer: string;
  icp: string;
  voice: string;
  targetIndustries: string[];
  avgDealValue: number;
}

export interface Research {
  summary: string;
  needs: string[];
  painPoints: string[];
  decisionMakers: { title: string; why: string }[];
  fitReasons: string[];
  intentSignals: string[];
  sources: string[];
}

export interface Score {
  score: number;
  tier: "Hot" | "Warm" | "Cold";
  base: number;
  adjustment: number;
  rationale: string;
  bestTiming?: string;
  signals: { label: string; weight: number }[];
  source: "rules" | "ai";
}

export interface Outreach {
  subject: string;
  message: string;
  nextSteps: string[];
  approved: boolean;
}

export type ProspectStatus = "new" | "researched" | "scored" | "outreach_ready" | "approved";

export interface Prospect {
  id: string;
  company: string;
  website: string;
  industry: string;
  size: number;
  location: string;
  notes: string;
  signals: string[];
  contact?: { name: string; title: string };
  dealValue: number;
  research?: Research;
  score?: Score;
  outreach?: Outreach;
  status: ProspectStatus;
  sample?: boolean;
  source?: { kind: "research-agent"; url?: string; date?: string; confidence?: string };
}

export interface ContentPost {
  id: string;
  topic: string;
  hook: string;
  body: string;
  hashtags: string[];
  keywords: string[];
  variations: string[];
  status: "draft" | "approved" | "scheduled" | "published";
  createdAt: string;
  prospectId?: string;
  platform: Platform;
  scheduledFor?: string; // ISO datetime
  publishedAt?: string;
}

export interface Recommendation {
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  action: "research" | "outreach" | "content" | "followup";
}

export interface AgentResponse<T> {
  data: T;
  usage: UsageRecord;
}
