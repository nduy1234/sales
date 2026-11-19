import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HRError, TERMINAL, answerText, listFiles, newIdempotencyKey, runStreamed, waitForResponse, type HRResponse, type SessionFile, type StreamEvent } from "./client";
import { RESEARCH_HARNESS_ID } from "./config";

export type TaskStatus = "starting" | "in_progress" | "completed" | "incomplete" | "failed" | "cancelled";

export interface TaskRecord {
  taskId: string;
  userId: string;
  feature: "prospect-research";
  harnessId: string;
  idempotencyKey: string;
  input: string;
  parentTaskId?: string;
  status: TaskStatus;
  responseId?: string;
  sessionId?: string;
  answer?: string;
  files?: SessionFile[];
  incompleteReason?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type Progress = { kind: "text"; delta: string } | { kind: "activity"; label: string } | { kind: "status"; status: TaskStatus };

// ---------- storage: one JSON file on the server (the app has no database yet) ----------
const FILE = join(process.cwd(), ".data", "agent-tasks.json");
type G = {
  __hrTasks?: Map<string, TaskRecord>;
  __hrLoad?: Promise<void>;
  __hrWrite?: Promise<void>;
  __hrListeners?: Map<string, Set<(p: Progress) => void>>;
  __hrLive?: Map<string, { text: string; activity: string[] }>;
  __hrRunning?: Set<string>;
};
const g = globalThis as unknown as G;
const tasks = (g.__hrTasks ??= new Map());
const listeners = (g.__hrListeners ??= new Map());
const live = (g.__hrLive ??= new Map());
const running = (g.__hrRunning ??= new Set());

async function load() {
  g.__hrLoad ??= (async () => {
    try {
      const arr = JSON.parse(await readFile(FILE, "utf8")) as TaskRecord[];
      for (const r of arr) if (!tasks.has(r.taskId)) tasks.set(r.taskId, r);
    } catch {}
  })();
  return g.__hrLoad;
}

async function save(rec: TaskRecord) {
  await load();
  tasks.set(rec.taskId, { ...rec, updatedAt: Date.now() });
  g.__hrWrite = (g.__hrWrite ?? Promise.resolve()).then(async () => {
    await mkdir(join(process.cwd(), ".data"), { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify([...tasks.values()], null, 1));
    await rename(tmp, FILE);
  }).catch(() => {});
  await g.__hrWrite;
}

export async function getTask(taskId: string, userId: string): Promise<TaskRecord | undefined> {
  await load();
  const r = tasks.get(taskId);
  return r && r.userId === userId ? r : undefined; // owner check
}

export async function listTasks(userId: string): Promise<TaskRecord[]> {
  await load();
  return [...tasks.values()].filter((t) => t.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- progress pub/sub (browser listeners never control the task) ----------
export function subscribe(taskId: string, fn: (p: Progress) => void) {
  const set = listeners.get(taskId) ?? new Set();
  set.add(fn);
  listeners.set(taskId, set);
  return () => {
    set.delete(fn);
    if (!set.size) listeners.delete(taskId);
  };
}
function publish(taskId: string, p: Progress) {
  for (const fn of listeners.get(taskId) ?? []) {
    try {
      fn(p);
    } catch {}
  }
}
export function liveState(taskId: string) {
  return live.get(taskId);
}

function toProgress(ev: StreamEvent): Progress | null {
  if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") return { kind: "text", delta: ev.delta };
  if (ev.type === "response.output_item.added" && ev.item?.type === "function_call") {
    const n = String(ev.item.name ?? "").toLowerCase();
    const label = /browser|search|fetch|browse|web/.test(n) ? "Researching the web" : /linkedin/.test(n) ? "Reading LinkedIn" : /write|edit/.test(n) ? "Writing files" : /read|grep|glob|ls/.test(n) ? "Reading files" : /bash|shell|exec/.test(n) ? "Running a step" : "Working";
    return { kind: "activity", label };
  }
  return null;
}

// ---------- running tasks ----------
async function settle(rec: TaskRecord, r: HRResponse) {
  const sessionId = rec.sessionId || r.metadata?.session_id || "";
  let files: SessionFile[] = [];
  if (sessionId && r.status !== "cancelled") {
    try {
      files = await listFiles(sessionId, true);
    } catch {}
  }
  const done: TaskRecord = { ...rec, responseId: rec.responseId || r.id, sessionId, status: r.status as TaskStatus, answer: answerText(r), files, incompleteReason: r.incomplete_details?.reason };
  await save(done);
  publish(rec.taskId, { kind: "status", status: done.status });
  live.delete(rec.taskId);
  return done;
}

function plainError(e: unknown) {
  if (e instanceof HRError) {
    if (e.status === 401 || e.status === 403) return "The agent service rejected the server's credentials. Ask the administrator to check the API key.";
    if (e.status === 409) return "This conversation is still busy. Wait for the current task to finish.";
    if (e.status === 429) return "The agent service is busy right now. Try again in a minute.";
    if (e.status >= 500) return "The agent service is temporarily unavailable. Try again shortly.";
    return "The agent could not run this request.";
  }
  return "Something went wrong while running the agent.";
}

async function execute(rec: TaskRecord, follow: { previousResponseId?: string; sessionId?: string }) {
  running.add(rec.taskId);
  live.set(rec.taskId, { text: "", activity: [] });
  try {
    const r = await runStreamed(
      { harnessId: rec.harnessId, input: rec.input, user: rec.userId, idempotencyKey: rec.idempotencyKey, ...follow },
      async (responseId, sessionId) => {
        rec = { ...rec, responseId, sessionId, status: "in_progress" };
        await save(rec);
        publish(rec.taskId, { kind: "status", status: "in_progress" });
      },
      (ev) => {
        const p = toProgress(ev);
        if (!p) return;
        const s = live.get(rec.taskId);
        if (s) {
          if (p.kind === "text") s.text += p.delta;
          if (p.kind === "activity") s.activity = [...s.activity, p.label].slice(-20);
        }
        publish(rec.taskId, p);
      },
    );
    await settle(rec, r);
  } catch (e) {
    await save({ ...rec, status: "failed", error: plainError(e) });
    publish(rec.taskId, { kind: "status", status: "failed" });
    live.delete(rec.taskId);
    if (!(e instanceof HRError)) console.error("[agent-task] unexpected failure", (e as Error)?.name);
  } finally {
    running.delete(rec.taskId);
  }
}

/** Creates the user's task record and starts it WITHOUT awaiting (it outlives the browser request). */
export async function startTask(userId: string, input: string, parent?: TaskRecord): Promise<TaskRecord> {
  if (parent && !TERMINAL.has(parent.status)) throw new Error("busy");
  const rec: TaskRecord = {
    taskId: randomUUID().replace(/-/g, ""),
    userId,
    feature: "prospect-research",
    // Always the server's configured harness; a follow-up reuses the harness the session started on.
    harnessId: parent?.harnessId ?? RESEARCH_HARNESS_ID,
    idempotencyKey: newIdempotencyKey(),
    input,
    parentTaskId: parent?.taskId,
    status: "starting",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await save(rec);
  void execute(rec, parent ? { previousResponseId: parent.responseId, sessionId: parent.sessionId } : {});
  return rec;
}

/** Finish records left running by a server restart: poll, never resend. */
export async function recover(userId: string) {
  for (const t of await listTasks(userId)) {
    if (TERMINAL.has(t.status) || running.has(t.taskId)) continue;
    if (!t.responseId) {
      await save({ ...t, status: "failed", error: "The task was interrupted before it started. Please submit it again." });
      continue;
    }
    running.add(t.taskId);
    void waitForResponse(t.responseId)
      .then((r) => settle(t, r))
      .catch(async (e) => save({ ...t, status: "failed", error: plainError(e) }))
      .finally(() => running.delete(t.taskId));
  }
}

/** Sanitized view for the browser: no upstream ids, harness id, or download URLs. */
export function publicTask(t: TaskRecord) {
  return {
    id: t.taskId,
    input: t.input,
    status: t.status,
    answer: t.answer ?? "",
    files: (t.files ?? []).map((f) => ({ path: f.path, name: f.filename, bytes: f.bytes, type: f.media_type })),
    incompleteReason: t.incompleteReason,
    error: t.error,
    parentId: t.parentTaskId,
    canContinue: TERMINAL.has(t.status) && !!t.responseId && t.status !== "cancelled",
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
export type PublicTask = ReturnType<typeof publicTask>;
