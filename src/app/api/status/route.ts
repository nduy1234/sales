import { NextResponse } from "next/server";
import { getConfig } from "@/lib/llm";
import { TASKS, selectModel } from "@/lib/models";
import type { TaskKind } from "@/lib/types";

export const dynamic = "force-dynamic";

// Reports configuration without ever exposing the key. ?check=1 verifies it against GET /models (no tokens spent).
export async function GET(req: Request) {
  const cfg = getConfig();
  const routing = (Object.keys(TASKS) as TaskKind[]).map((t) => {
    const std = selectModel(t, cfg.catalog);
    const pre = selectModel(t, cfg.catalog, true);
    return { task: t, label: TASKS[t].label, complexity: TASKS[t].complexity, standard: std.model.id, premium: pre.model.id, reason: std.reason };
  });
  let verified: { ok: boolean; message: string } | null = null;
  if (cfg.live && new URL(req.url).searchParams.get("check") === "1") {
    try {
      const res = await fetch(`${cfg.baseUrl}/models`, { headers: { Authorization: `Bearer ${cfg.key}` }, cache: "no-store" });
      verified = { ok: res.ok, message: res.ok ? "Key accepted by TokenRouter" : `TokenRouter responded ${res.status}` };
    } catch (e) {
      verified = { ok: false, message: `Could not reach TokenRouter: ${(e as Error).message}` };
    }
  }
  return NextResponse.json({ live: cfg.live, baseUrl: cfg.baseUrl, catalog: cfg.catalog, routing, verified });
}
