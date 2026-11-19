import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// HR_API_KEY from the real environment (production secret settings), else the one-line
// .env.harnessrouter written by the secure key prompt. Never logged, never sent to the browser.
let cached: string | undefined;
export function hrApiKey(): string {
  if (cached) return cached;
  const env = process.env.HR_API_KEY?.trim();
  if (env) return (cached = env);
  const lines = readFileSync(join(process.cwd(), ".env.harnessrouter"), "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length !== 1 || !lines[0].startsWith("HR_API_KEY=")) throw new Error("HarnessRouter key file must hold one HR_API_KEY line");
  return (cached = lines[0].slice("HR_API_KEY=".length).trim());
}

export function hasHrApiKey(): boolean {
  try {
    return hrApiKey().length > 0;
  } catch {
    return false;
  }
}
