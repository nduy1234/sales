import "server-only";
import { randomUUID } from "node:crypto";
import { hrApiKey } from "./key";
import { answerText, parseSSE, type HRResponse, type StreamEvent } from "./sse";
export { answerText, parseSSE } from "./sse";
export type { Annotation, HRResponse, OutputItem, StreamEvent } from "./sse";

// Minimal HarnessRouter Cloud client (UHP 2026-09-28). Server-only: holds the API key.
export const HR_API_BASE = "https://api.harnessrouter.ai";
export const UHP_VERSION = "2026-09-28";
export const TERMINAL = new Set(["completed", "incomplete", "failed", "cancelled"]);
const TERMINAL_EVENTS = new Set(["response.completed", "response.incomplete", "response.failed"]);

export interface SessionFile { id: string; filename: string; path: string; bytes: number; media_type: string }
export interface Harness { id: string; name: string; base: string; defaultModel: string; systemPrompt: string; [k: string]: unknown }

export class HRError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
  get retryable() {
    return [429, 502, 503, 504].includes(this.status);
  }
}

async function hrFetch(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${hrApiKey()}`, "UHP-Version": UHP_VERSION, Accept: "application/json", ...init.headers };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(HR_API_BASE + path, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), redirect: "manual", cache: "no-store" });
  if (!res.ok) {
    let code = res.status === 404 ? "not_found" : "unknown";
    let msg = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      code = j?.error?.code ?? code;
      msg = j?.error?.message ?? j?.detail ?? msg;
    } catch {}
    throw new HRError(res.status, code, msg);
  }
  return res;
}

export interface TaskArgs {
  harnessId: string;
  input: string;
  user: string;
  idempotencyKey: string;
  previousResponseId?: string;
  sessionId?: string;
}

/** Streams one task to its end (independent of any browser connection). Falls back to polling. */
export async function runStreamed(t: TaskArgs, onIds: (responseId: string, sessionId: string) => Promise<void>, onEvent: (ev: StreamEvent) => void): Promise<HRResponse> {
  const metadata: Record<string, string> = { harness_id: t.harnessId };
  if (t.sessionId) metadata.session_id = t.sessionId;
  const body: Record<string, unknown> = { input: t.input, user: t.user, metadata, stream: true };
  if (t.previousResponseId) body.previous_response_id = t.previousResponseId;
  const res = await hrFetch("/v1/responses", { method: "POST", body, headers: { Accept: "text/event-stream", "Idempotency-Key": t.idempotencyKey } });
  if (!res.body) throw new HRError(502, "no_body", "Empty stream");
  let responseId = "";
  let sessionId = "";
  let terminal: HRResponse | null = null;
  try {
    for await (const ev of parseSSE(res.body)) {
      const r = ev.response;
      if (r?.id && !responseId) responseId = r.id;
      const sid = r?.metadata?.session_id;
      if (sid && !sessionId) {
        sessionId = sid;
        await onIds(responseId, sessionId);
      }
      onEvent(ev);
      if (TERMINAL_EVENTS.has(ev.type) && r) terminal = r;
    }
  } catch (e) {
    if (!responseId) throw e;
  }
  if (terminal) return terminal;
  if (!responseId) throw new HRError(502, "stream_ended", "Stream ended before the task started");
  return waitForResponse(responseId);
}

export async function getResponse(id: string): Promise<HRResponse> {
  return (await hrFetch(`/v1/responses/${encodeURIComponent(id)}`)).json();
}

export async function waitForResponse(id: string): Promise<HRResponse> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await getResponse(id);
      if (TERMINAL.has(r.status)) return r;
    } catch (e) {
      if (!(e instanceof HRError) || !e.retryable) throw e;
    }
    if (Date.now() - start > 2 * 60 * 60 * 1000) throw new HRError(504, "poll_timeout", "Task did not finish in time");
    await new Promise((r) => setTimeout(r, Date.now() - start > 60_000 ? 10_000 : 3_000));
  }
}

export async function cancelResponse(id: string) {
  await hrFetch(`/v1/responses/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} });
}

export async function listFiles(sessionId: string, changed = false): Promise<SessionFile[]> {
  const r = await (await hrFetch(`/v1/sessions/${encodeURIComponent(sessionId)}/files${changed ? "?changed=true" : ""}`)).json();
  return ((r.files ?? []) as SessionFile[]).map((f) => ({ id: f.id, filename: f.filename, path: f.path, bytes: f.bytes, media_type: f.media_type }));
}

/** File bytes; the URL is built here so the key only ever goes to the API origin. */
export async function fetchFile(sessionId: string, fileId: string) {
  const res = await hrFetch(`/v1/containers/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}/content`, { headers: { Accept: "*/*" } });
  return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") || "application/octet-stream" };
}

export async function getHarness(id: string): Promise<{ harness: Harness; etag: string | null }> {
  const res = await hrFetch(`/v1/harnesses/${encodeURIComponent(id)}`);
  return { harness: await res.json(), etag: res.headers.get("etag") };
}

export async function me(): Promise<{ workspace_name?: string }> {
  return (await hrFetch("/v1/me")).json();
}

export const newIdempotencyKey = () => randomUUID();
