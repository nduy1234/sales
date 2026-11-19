import { NextResponse } from "next/server";
import { hasHrApiKey } from "@/lib/harnessrouter/key";
import { getTask, listTasks, publicTask, recover, startTask } from "@/lib/harnessrouter/tasks";
import { currentUserId } from "@/lib/harnessrouter/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_INPUT = 8000;

// The signed-in (cookie) user's tasks.
export async function GET() {
  const userId = currentUserId(false);
  if (!userId) return NextResponse.json({ configured: hasHrApiKey(), tasks: [] });
  await recover(userId);
  return NextResponse.json({ configured: hasHrApiKey(), tasks: (await listTasks(userId)).map(publicTask) });
}

// Start a new task, or a follow-up on one of this user's finished tasks.
export async function POST(req: Request) {
  if (!hasHrApiKey()) return NextResponse.json({ error: "The research agent is not configured on the server yet." }, { status: 503 });
  let body: { input?: unknown; continueId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "Describe what you want researched." }, { status: 400 });
  if (input.length > MAX_INPUT) return NextResponse.json({ error: `Please keep the request under ${MAX_INPUT} characters.` }, { status: 400 });
  const userId = currentUserId(true)!;
  let parent;
  if (typeof body.continueId === "string") {
    parent = await getTask(body.continueId, userId);
    if (!parent) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    if (!parent.responseId) return NextResponse.json({ error: "That task cannot be continued." }, { status: 400 });
  }
  try {
    const rec = await startTask(userId, input, parent);
    return NextResponse.json({ task: publicTask(rec) }, { status: 202 });
  } catch (e) {
    if ((e as Error).message === "stale") return NextResponse.json({ error: "This task ran on a previous agent configuration and can't be continued. Start a new request." }, { status: 409 });
    if ((e as Error).message === "busy") return NextResponse.json({ error: "Wait for the current task to finish before continuing it." }, { status: 409 });
    return NextResponse.json({ error: "Could not start the task." }, { status: 500 });
  }
}
