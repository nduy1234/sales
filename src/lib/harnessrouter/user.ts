import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// The app has no login yet, so each browser gets a stable, opaque, server-issued user id in an
// httpOnly cookie. It owns that browser's agent tasks and is sent to HarnessRouter as `user`.
// Replace with the authenticated user's id when auth is added.
const COOKIE = "rp_uid";

export function currentUserId(create = true): string | null {
  const jar = cookies();
  const v = jar.get(COOKIE)?.value;
  if (v && /^u_[a-f0-9]{32}$/.test(v)) return v;
  if (!create) return null;
  const id = `u_${randomUUID().replace(/-/g, "")}`;
  jar.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}
