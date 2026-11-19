"use client";

import { useCallback } from "react";
import { uid, useStore } from "./store";
import type { ContentPost, Outreach, Platform, Prospect, Research, Score, UsageRecord } from "./types";

export type Result<T> = { data: T; usage?: UsageRecord; reused?: boolean };

// Each action reuses stored results unless `force` is set — avoids repeated research spend.
export function useAgent() {
  const { callAgent, updateProspect, savePost } = useStore();

  const research = useCallback(
    async (p: Prospect, force = false): Promise<Result<Research>> => {
      if (p.research && !force) return { data: p.research, reused: true };
      const r = await callAgent<Research>("research", { prospect: strip(p) });
      updateProspect(p.id, { research: r.data, status: bump(p.status, "researched") });
      return r;
    },
    [callAgent, updateProspect],
  );

  const score = useCallback(
    async (p: Prospect, force = false): Promise<Result<Score>> => {
      if (p.score?.source === "ai" && !force) return { data: p.score, reused: true };
      const r = await callAgent<Score>("score", { prospect: strip(p) });
      updateProspect(p.id, { score: r.data, status: bump(p.status, "scored") });
      return r;
    },
    [callAgent, updateProspect],
  );

  const outreach = useCallback(
    async (p: Prospect, premium = false): Promise<Result<Outreach>> => {
      const r = await callAgent<Outreach>("outreach", { prospect: strip(p) }, premium);
      updateProspect(p.id, { outreach: r.data, status: bump(p.status, "outreach_ready") });
      return r;
    },
    [callAgent, updateProspect],
  );

  const post = useCallback(
    async (topic: string, p?: Prospect, premium = false, platform: Platform = "linkedin"): Promise<Result<ContentPost>> => {
      const r = await callAgent<Omit<ContentPost, "id" | "status" | "createdAt" | "topic" | "platform">>(platform === "x" ? "xpost" : "linkedin", { topic, prospect: p ? strip(p) : undefined }, premium);
      const cp: ContentPost = { ...r.data, id: uid(), topic, platform, status: "draft", createdAt: new Date().toISOString(), prospectId: p?.id };
      savePost(cp);
      return { data: cp, usage: r.usage };
    },
    [callAgent, savePost],
  );

  return { research, score, outreach, post };
}

// Send only what the prompt needs (smaller payloads, smaller prompts).
function strip(p: Prospect): Partial<Prospect> {
  return { id: p.id, company: p.company, website: p.website, industry: p.industry, size: p.size, location: p.location, notes: p.notes, signals: p.signals, contact: p.contact, research: p.research };
}

const ORDER = ["new", "researched", "scored", "outreach_ready", "approved"] as const;
export function bump(cur: Prospect["status"], next: Prospect["status"]): Prospect["status"] {
  return ORDER.indexOf(next) > ORDER.indexOf(cur) ? next : cur;
}
