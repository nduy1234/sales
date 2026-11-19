import type { ContentPost, Platform } from "./types";

// Posting windows (local time). Commonly recommended B2B windows; adjust per audience.
const WINDOWS: Record<Platform, { days: number[]; hour: number; minute: number }> = {
  linkedin: { days: [2, 3, 4], hour: 9, minute: 0 }, // Tue–Thu 09:00
  x: { days: [1, 2, 3, 4, 5], hour: 12, minute: 30 }, // Mon–Fri 12:30
};

export const platformLabel = (p: Platform | undefined) => (p === "x" ? "X" : "LinkedIn");

/** Next free slots for a platform after `from`, skipping slots already taken. */
export function nextSlots(platform: Platform, from: Date, taken: Set<string>, count = 1): string[] {
  const w = WINDOWS[platform];
  const out: string[] = [];
  const d = new Date(from);
  d.setSeconds(0, 0);
  for (let i = 0; i < 60 && out.length < count; i++) {
    const slot = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, w.hour, w.minute);
    if (slot <= from || !w.days.includes(slot.getDay())) continue;
    const iso = slot.toISOString();
    if (!taken.has(`${platform}|${iso}`)) out.push(iso);
  }
  return out;
}

/** Assigns the next free slot to each approved, unscheduled post. Returns id -> ISO time. */
export function autoSchedule(posts: ContentPost[], now = new Date()): Record<string, string> {
  const taken = new Set(posts.filter((p) => p.scheduledFor && p.status !== "published").map((p) => `${p.platform ?? "linkedin"}|${p.scheduledFor}`));
  const result: Record<string, string> = {};
  for (const p of [...posts].reverse()) {
    if (p.status !== "approved" || p.scheduledFor) continue;
    const platform = p.platform ?? "linkedin";
    const [slot] = nextSlots(platform, now, taken, 1);
    if (!slot) continue;
    taken.add(`${platform}|${slot}`);
    result[p.id] = slot;
  }
  return result;
}

export function isDue(p: ContentPost, now = new Date()) {
  return p.status === "scheduled" && !!p.scheduledFor && new Date(p.scheduledFor) <= now;
}

/** Opens the platform's own composer with the text prefilled; the user presses Post. */
export function composeUrl(p: ContentPost): string {
  const tags = p.hashtags.map((h) => `#${h}`).join(" ");
  if ((p.platform ?? "linkedin") === "x") {
    const first = p.body.split(/\n\n/)[0] ?? p.body;
    const text = first.length + tags.length + 1 <= 280 && tags ? `${first} ${tags}` : first.slice(0, 280);
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  }
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(`${p.body}\n\n${tags}`.slice(0, 2900))}`;
}

export function fullText(p: ContentPost) {
  const tags = p.hashtags.map((h) => `#${h}`).join(" ");
  return tags ? `${p.body}\n\n${tags}` : p.body;
}
