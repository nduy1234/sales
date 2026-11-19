import { fetchFile } from "@/lib/harnessrouter/client";
import { getTask } from "@/lib/harnessrouter/tasks";
import { currentUserId } from "@/lib/harnessrouter/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Owner-checked download. Bytes are fetched server-side with the key; always served as an attachment.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = currentUserId(false);
  const t = userId ? await getTask(params.id, userId) : undefined;
  const path = new URL(req.url).searchParams.get("path") ?? "";
  const file = t?.sessionId ? t.files?.find((f) => f.path === path) : undefined;
  if (!t || !file || !t.sessionId) return new Response("Not found", { status: 404 });
  try {
    const { bytes, contentType } = await fetchFile(t.sessionId, file.id);
    const name = file.filename.replace(/["\r\n\\]/g, "_");
    return new Response(bytes, {
      headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${name}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("File unavailable", { status: 502 });
  }
}
