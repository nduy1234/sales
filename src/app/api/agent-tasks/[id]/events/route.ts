import { TERMINAL } from "@/lib/harnessrouter/client";
import { getTask, liveState, publicTask, subscribe, type Progress } from "@/lib/harnessrouter/tasks";
import { currentUserId } from "@/lib/harnessrouter/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sanitized progress as Server-Sent Events. Closing this stream never stops the task.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = currentUserId(false);
  const t = userId ? await getTask(params.id, userId) : undefined;
  if (!t) return new Response("Not found", { status: 404 });

  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      const send = (obj: unknown) => {
        try {
          ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {}
      };
      const finish = async () => {
        const done = userId ? await getTask(params.id, userId) : undefined;
        if (done) send({ kind: "final", task: publicTask(done) });
        cleanup();
        try {
          ctrl.close();
        } catch {}
      };
      if (TERMINAL.has(t.status)) {
        void finish();
        return;
      }
      const s = liveState(t.taskId);
      send({ kind: "snapshot", status: t.status, text: s?.text ?? "", activity: s?.activity ?? [] });
      const unsub = subscribe(t.taskId, (p: Progress) => {
        send(p);
        if (p.kind === "status" && TERMINAL.has(p.status)) void finish();
      });
      const ping = setInterval(() => send({ kind: "ping" }), 15000);
      cleanup = () => {
        unsub();
        clearInterval(ping);
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
