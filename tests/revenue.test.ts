import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_ASSUMPTIONS, revenueImpact, winProbability } from "../src/lib/revenue.ts";
import { SAMPLE_PROSPECTS } from "../src/lib/sample-data.ts";

test("win probability grows with intent and stays a probability", () => {
  assert.ok(winProbability(90) > winProbability(40));
  assert.ok(winProbability(100) <= 1 && winProbability(0) === 0);
  assert.equal(winProbability(50), DEFAULT_ASSUMPTIONS.replyRate * DEFAULT_ASSUMPTIONS.meetingRate * DEFAULT_ASSUMPTIONS.closeRate);
});

test("only approved outreach counts toward pipeline; cached calls save no time", () => {
  const p = { ...SAMPLE_PROSPECTS[0], score: { score: 80 } as never, outreach: { subject: "", message: "", nextSteps: [], approved: true } };
  const q = { ...SAMPLE_PROSPECTS[1], score: { score: 60 } as never, outreach: { subject: "", message: "", nextSteps: [], approved: false } };
  const u = (task: string, cached = false) => ({ task, cost: 0.001, cached } as never);
  const r = revenueImpact([p, q], [], [u("research"), u("outreach"), u("research", true)]);
  assert.equal(r.engaged, 1);
  assert.equal(r.pipeline, p.dealValue);
  assert.ok(r.expected > 0 && r.pendingExpected > 0);
  assert.equal(Math.round(r.hoursSaved * 60), 32);
  assert.ok(r.roi > 1000);
});
