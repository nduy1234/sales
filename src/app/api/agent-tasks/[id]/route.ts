import { NextResponse } from "next/server";
import { getTask, publicTask } from "@/lib/harnessrouter/tasks";
import { currentUserId } from "@/lib/harnessrouter/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = currentUserId(false);
  const t = userId ? await getTask(params.id, userId) : undefined;
  if (!t) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  return NextResponse.json({ task: publicTask(t) });
}
