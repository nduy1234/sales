import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MODELS, baselineModel, priceOf, selectModel } from "../src/lib/models.ts";
import { finalize, ruleScore } from "../src/lib/scoring.ts";
import { SAMPLE_BRAND, SAMPLE_PROSPECTS } from "../src/lib/sample-data.ts";

test("simple tasks route to the cheapest model", () => {
  for (const t of ["research", "score", "recommendations"] as const) assert.equal(selectModel(t, DEFAULT_MODELS).model.tier, "economy");
});

test("writing tasks route to balanced; premium bumps one tier", () => {
  assert.equal(selectModel("outreach", DEFAULT_MODELS).model.tier, "balanced");
  assert.equal(selectModel("linkedin", DEFAULT_MODELS, true).model.tier, "premium");
  assert.equal(selectModel("research", DEFAULT_MODELS, true).model.tier, "balanced");
});

test("escalation floor picks next quality", () => {
  assert.equal(selectModel("research", DEFAULT_MODELS, false, 2).model.tier, "balanced");
});

test("baseline is premium and costs more than economy", () => {
  const b = baselineModel(DEFAULT_MODELS);
  assert.equal(b.tier, "premium");
  assert.ok(priceOf(b, 1000, 1000) > 10 * priceOf(DEFAULT_MODELS[0], 1000, 1000));
  assert.equal(priceOf(DEFAULT_MODELS[0], 1_000_000, 0), 0.15);
});

test("rule score ranks signal-rich prospects above quiet ones", () => {
  const s = (id: string) => ruleScore(SAMPLE_PROSPECTS.find((p) => p.id === id)!, SAMPLE_BRAND).score;
  assert.ok(s("p-northwind") >= 75);
  assert.ok(s("p-ledgerline") < 50);
});

test("AI adjustment is clamped to ±10 and score to 0..100", () => {
  const base = ruleScore(SAMPLE_PROSPECTS[0], SAMPLE_BRAND);
  assert.equal(finalize(base, 50, "x", "ai").adjustment, 10);
  assert.ok(finalize(base, 50, "x", "ai").score <= 100);
  assert.equal(finalize(base, -99, "x", "ai").adjustment, -10);
});
