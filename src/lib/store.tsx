"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SAMPLE_BRAND, SAMPLE_PROSPECTS } from "./sample-data";
import { finalize, ruleScore } from "./scoring";
import { DEFAULT_ASSUMPTIONS, type Assumptions } from "./revenue";
import type { Brand, ContentPost, ModelInfo, Prospect, Recommendation, TaskKind, UsageRecord } from "./types";

export interface Status {
  live: boolean;
  baseUrl: string;
  catalog: ModelInfo[];
  routing: { task: TaskKind; label: string; complexity: number; standard: string; premium: string; reason: string }[];
  verified: { ok: boolean; message: string } | null;
}

interface State {
  brand: Brand;
  prospects: Prospect[];
  posts: ContentPost[];
  usage: UsageRecord[];
  recs: { date: string; items: Recommendation[] } | null;
  assumptions: Assumptions;
}

const KEY = "revenue-agent:v1";

function seed(): State {
  // Seeded prospects get a free rule-based score only — no AI output is pre-filled.
  const prospects = SAMPLE_PROSPECTS.map((p) => ({ ...p, score: finalize(ruleScore(p, SAMPLE_BRAND), 0, "Rule-based signal score (no AI run yet).", "rules") }));
  return { brand: SAMPLE_BRAND, prospects, posts: [], usage: [], recs: null, assumptions: DEFAULT_ASSUMPTIONS };
}

interface Ctx extends State {
  ready: boolean;
  status: Status | null;
  refreshStatus: (check?: boolean) => Promise<void>;
  callAgent: <T>(task: TaskKind, payload: Record<string, unknown>, premium?: boolean) => Promise<{ data: T; usage?: UsageRecord }>;
  updateProspect: (id: string, patch: Partial<Prospect>) => void;
  addProspect: (p: Prospect) => void;
  removeProspect: (id: string) => void;
  savePost: (p: ContentPost) => void;
  updatePost: (id: string, patch: Partial<ContentPost>) => void;
  setBrand: (b: Brand) => void;
  setRecs: (r: State["recs"]) => void;
  setAssumptions: (a: Assumptions) => void;
  addProspects: (ps: Prospect[]) => void;
  reset: () => void;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(seed);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<State>;
        // Older saves predate multi-platform posts.
        const posts = (saved.posts ?? []).map((p) => ({ ...p, platform: p.platform ?? "linkedin" }));
        setState({ ...seed(), ...saved, posts });
      }
    } catch {}
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, ready]);

  const refreshStatus = useCallback(async (check = false) => {
    try {
      const res = await fetch(`/api/status${check ? "?check=1" : ""}`, { cache: "no-store" });
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const callAgent = useCallback(async <T,>(task: TaskKind, payload: Record<string, unknown>, premium = false): Promise<{ data: T; usage?: UsageRecord }> => {
    const res = await fetch(`/api/agent/${task}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: stateRef.current.brand, premium, ...payload }),
    });
    let json: { data?: T; usage?: UsageRecord; error?: string } = {};
    try {
      json = await res.json();
    } catch {}
    if (!res.ok || !json.data) throw new Error(json.error || `Request failed (${res.status})`);
    if (json.usage) setState((s) => ({ ...s, usage: [json.usage!, ...s.usage].slice(0, 500) }));
    return { data: json.data, usage: json.usage };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      ready,
      status,
      refreshStatus,
      callAgent,
      updateProspect: (id, patch) => setState((s) => ({ ...s, prospects: s.prospects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      addProspect: (p) => setState((s) => ({ ...s, prospects: [p, ...s.prospects] })),
      removeProspect: (id) => setState((s) => ({ ...s, prospects: s.prospects.filter((p) => p.id !== id) })),
      savePost: (p) => setState((s) => ({ ...s, posts: [p, ...s.posts] })),
      updatePost: (id, patch) => setState((s) => ({ ...s, posts: s.posts.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      setBrand: (brand) => setState((s) => ({ ...s, brand })),
      setRecs: (recs) => setState((s) => ({ ...s, recs })),
      setAssumptions: (assumptions) => setState((s) => ({ ...s, assumptions })),
      addProspects: (ps) => setState((s) => ({ ...s, prospects: [...ps, ...s.prospects] })),
      reset: () => setState(seed()),
    }),
    [state, ready, status, refreshStatus, callAgent],
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("useStore outside provider");
  return c;
}

export function totals(usage: UsageRecord[]) {
  const spent = usage.reduce((s, u) => s + u.cost, 0);
  const baseline = usage.reduce((s, u) => s + u.baselineCost, 0);
  const tokens = usage.reduce((s, u) => s + u.promptTokens + u.completionTokens, 0);
  const saved = Math.max(0, baseline - spent);
  return { spent, baseline, saved, tokens, pct: baseline > 0 ? (saved / baseline) * 100 : 0, calls: usage.length, cached: usage.filter((u) => u.cached).length };
}

export const fmtUsd = (n: number) => (n === 0 ? "$0.00" : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(n < 1 ? 4 : 2)}`);
export const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
export const uid = () => Math.random().toString(36).slice(2, 10);
