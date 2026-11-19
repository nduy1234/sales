import { NextResponse } from "next/server";
import { cancelResponse } from "@/lib/harnessrouter/client";
import { TERMINAL } from "@/lib/harnessrouter/client";
import { getTask } from "@/lib/harnessrouter/tasks";
import { currentUserId } from "@/lib/harnessrouter/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = currentUserId(false);
  const t = userId ? await getTask(params.id, userId) : undefined;
  if (!t) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  if (TERMINAL.has(t.status)) return NextResponse.json({ ok: true });
  if (!t.responseId) return NextResponse.json({ error: "The task has not started yet; try again in a moment." }, { status: 409 });
  try {
    await cancelResponse(t.responseId); // the running stream then ends with status "cancelled"
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not cancel the task." }, { status: 502 });
  }
}
