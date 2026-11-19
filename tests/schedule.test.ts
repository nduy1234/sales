import { test } from "node:test";
import assert from "node:assert/strict";
import { autoSchedule, composeUrl, isDue, nextSlots } from "../src/lib/schedule.ts";
import type { ContentPost } from "../src/lib/types.ts";

const post = (id: string, platform: "linkedin" | "x", status: ContentPost["status"] = "approved", extra: Partial<ContentPost> = {}): ContentPost =>
  ({ id, topic: "t", hook: "h", body: "Tweet one\n\nTweet two", hashtags: ["SmallBusiness"], keywords: [], variations: [], status, createdAt: "", platform, ...extra });

test("LinkedIn slots land Tue-Thu 09:00 local, in the future", () => {
  const from = new Date(2026, 10, 16, 10, 0); // Mon 16 Nov 2026
  const slots = nextSlots("linkedin", from, new Set(), 3).map((s) => new Date(s));
  assert.deepEqual(slots.map((d) => d.getDay()), [2, 3, 4]);
  assert.ok(slots.every((d) => d.getHours() === 9 && d > from));
});

test("autoSchedule gives distinct slots per platform and skips drafts", () => {
  const now = new Date(2026, 10, 16, 10, 0);
  const r = autoSchedule([post("a", "linkedin"), post("b", "linkedin"), post("c", "x"), post("d", "x", "draft")], now);
  assert.equal(Object.keys(r).length, 3);
  assert.notEqual(r.a, r.b);
  assert.equal(r.d, undefined);
});

test("composeUrl opens the right composer and keeps X under 280 chars", () => {
  assert.match(composeUrl(post("x1", "x")), /^https:\/\/twitter\.com\/intent\/tweet\?text=Tweet%20one/);
  const long = composeUrl(post("x2", "x", "approved", { body: "a".repeat(400) }));
  assert.ok(decodeURIComponent(long.split("text=")[1]).length <= 280);
  assert.match(composeUrl(post("l", "linkedin")), /^https:\/\/www\.linkedin\.com\/feed\/\?shareActive=true&text=/);
});

test("isDue only for scheduled posts in the past", () => {
  const now = new Date(2026, 10, 18, 12);
  assert.equal(isDue(post("p", "x", "scheduled", { scheduledFor: new Date(2026, 10, 18, 9).toISOString() }), now), true);
  assert.equal(isDue(post("q", "x", "approved", { scheduledFor: new Date(2026, 10, 18, 9).toISOString() }), now), false);
});
