import { test } from "node:test";
import assert from "node:assert/strict";
import { requestsPublishing } from "../src/lib/publishing.ts";

test("drafts-only requests need no publishing consent", () => {
  assert.equal(requestsPublishing("Publishing: Drafts only. Return the LinkedIn and X drafts for my approval; do not publish or schedule anything."), false);
  assert.equal(requestsPublishing("Find prospects and write a post"), false);
});

test("schedule or publish requests need consent", () => {
  assert.equal(requestsPublishing("Publishing: Schedule today's LinkedIn post for 2026-11-18 09:00"), true);
  assert.equal(requestsPublishing("ok, publish the X post now"), true);
});
