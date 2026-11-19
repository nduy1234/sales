// Server-only: TokenRouter client + cost-aware routing. Never import from client components.
import { createHash, randomUUID } from "crypto";
import { DEFAULT_MODELS, TASKS, baselineModel, estimateTokens, priceOf, selectModel } from "./models";
import { parseJson } from "./json";
import { buildMessages, simulate, type Msg, type Payload } from "./tasks";
import type { ModelInfo, TaskKind, UsageRecord } from "./types";

export function getConfig() {
  const key = process.env.TOKENROUTER_API_KEY?.trim() || "";
  const baseUrl = (process.env.TOKENROUTER_BASE_URL?.trim() || "https://api.tokenrouter.io/v1").replace(/\/+$/, "");
  const ids = [process.env.TOKENROUTER_MODEL_ECONOMY, process.env.TOKENROUTER_MODEL_BALANCED, process.env.TOKENROUTER_MODEL_PREMIUM];
  const catalog: ModelInfo[] = DEFAULT_MODELS.map((m, i) => ({ ...m, id: ids[i]?.trim() || m.id }));
  return { key, baseUrl, catalog, live: key.length > 0 };
}

type CacheEntry = { data: unknown; promptTokens: number; completionTokens: number; model: ModelInfo; at: number };
const g = globalThis as unknown as { __trCache?: Map<string, CacheEntry> };
const cache = (g.__trCache ??= new Map());
const TTL = 1000 * 60 * 60 * 6;

export class AgentError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}


async function callModel(cfg: ReturnType<typeof getConfig>, model: ModelInfo, messages: Msg[], maxTokens: number) {
  const body: Record<string, unknown> = { model: model.id, messages, max_tokens: maxTokens };
  // GPT-5 family are reasoning models; keep reasoning minimal so the token budget goes to the answer.
  if (/gpt-5/.test(model.id)) {
    body.reasoning_effort = "minimal";
    body.max_tokens = maxTokens + 600;
  } else body.temperature = 0.6;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      let msg = raw.slice(0, 300);
      try {
        msg = JSON.parse(raw)?.error?.message ?? msg;
      } catch {}
      throw new AgentError(`TokenRouter ${res.status}: ${msg}`, res.status === 401 ? 401 : 502);
    }
    const json = JSON.parse(raw);
    const text: string = json?.choices?.[0]?.message?.content ?? "";
    const pt = json?.usage?.prompt_tokens ?? estimateTokens(messages.map((m) => m.content).join("\n"));
    const ct = json?.usage?.completion_tokens ?? estimateTokens(text);
    return { text, promptTokens: pt as number, completionTokens: ct as number };
  } catch (e) {
    if (e instanceof AgentError) throw e;
    throw new AgentError(`TokenRouter request failed: ${(e as Error).name === "AbortError" ? "timed out" : (e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function runTask(task: TaskKind, payload: Payload, opts: { premium?: boolean } = {}) {
  const cfg = getConfig();
  const spec = TASKS[task];
  const baseline = baselineModel(cfg.catalog);
  let { model, reason } = selectModel(task, cfg.catalog, opts.premium);
  const messages = buildMessages(task, payload);
  const started = Date.now();
  const subject = payload.prospect?.company ?? payload.topic?.slice(0, 40);

  const record = (m: ModelInfo, pt: number, ct: number, extra: Partial<UsageRecord>): UsageRecord => ({
    id: randomUUID(),
    task,
    model: m.id,
    tier: m.tier,
    promptTokens: pt,
    completionTokens: ct,
    cost: priceOf(m, pt, ct),
    baselineCost: priceOf(baseline, pt, ct),
    latencyMs: Date.now() - started,
    mode: cfg.live ? "live" : "simulated",
    cached: false,
    escalated: false,
    reason,
    at: new Date().toISOString(),
    subject,
    ...extra,
  });

  if (!cfg.live) {
    const data = simulate(task, payload);
    const pt = estimateTokens(messages.map((m) => m.content).join("\n"));
    const ct = estimateTokens(JSON.stringify(data));
    return { data, usage: record(model, pt, ct, {}) };
  }

  const key = createHash("sha256").update(JSON.stringify([task, model.id, messages])).digest("hex");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    // Cached: no API call, no new spend. Baseline shows what a repeat call would have cost.
    return { data: hit.data, usage: { ...record(hit.model, hit.promptTokens, hit.completionTokens, { cached: true }), cost: 0, reason: "Identical request served from cache — no API call." } };
  }

  let escalated = false;
  let totalPt = 0;
  let totalCt = 0;
  let wastedCost = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await callModel(cfg, model, messages, spec.maxTokens);
    totalPt += out.promptTokens;
    totalCt += out.completionTokens;
    try {
      const data = parseJson(out.text);
      cache.set(key, { data, promptTokens: out.promptTokens, completionTokens: out.completionTokens, model, at: Date.now() });
      const usage = record(model, totalPt, totalCt, { escalated });
      usage.cost = priceOf(model, out.promptTokens, out.completionTokens) + wastedCost;
      return { data, usage };
    } catch {
      if (attempt === 1) throw new AgentError(`${model.label} returned output that was not valid JSON.`);
      // One bounded escalation to the next tier — no open-ended agent loops.
      wastedCost += priceOf(model, out.promptTokens, out.completionTokens);
      const next = selectModel(task, cfg.catalog, opts.premium, model.quality + 1);
      if (next.model.id === model.id) throw new AgentError(`${model.label} returned output that was not valid JSON.`);
      reason = `${reason} Escalated once to ${next.model.label} after unparseable output.`;
      model = next.model;
      escalated = true;
    }
  }
  throw new AgentError("unreachable");
}

// Fetch a prospect's homepage text (free, no AI) to ground research. Skips fictional domains.
export async function fetchSiteText(website: string): Promise<string> {
  if (!website || /\.(example|test|invalid|localhost)$/i.test(website.replace(/\/.*$/, ""))) return "";
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  try {
    const u = new URL(url);
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith(".internal")) return "";
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(u, { signal: ctrl.signal, headers: { "User-Agent": "RevenueAgentBot/0.1" }, redirect: "follow" });
    clearTimeout(t);
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return "";
    const html = (await res.text()).slice(0, 300_000);
    return html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&amp;|&#\d+;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1800);
  } catch {
    return "";
  }
}
