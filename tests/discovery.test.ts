import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProspectTable } from "../src/lib/discovery.ts";

test("parses the agent's prospect table with links, dates and markdown", () => {
  const md = `## Prioritized prospects

| Prospect | Fit | Buying signal | Evidence URL/date | Confidence | Suggested next step |
|---|---|---|---|---|---|
| **Acme Dental** | Dental, 20 staff | Posted RFP for new website | [link](https://example.com/rfp) · 2026-11-10 | High | Reply to RFP |
| Bay Fitness | Gym | Asked for booking app recs | https://example.org/post Nov 12, 2026 | Medium | Comment with tip |
| None found | | | | | |

## LinkedIn drafts`;
  const rows = parseProspectTable(md);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Acme Dental");
  assert.equal(rows[0].evidenceUrl, "https://example.com/rfp");
  assert.equal(rows[0].evidenceDate, "2026-11-10");
  assert.equal(rows[1].evidenceUrl, "https://example.org/post");
  assert.equal(rows[1].confidence, "Medium");
});

test("no table, no rows", () => {
  assert.deepEqual(parseProspectTable("Browser is not connected; no prospects verified."), []);
});

test("handles 'intent evidence' + separate 'sources' columns", () => {
  const md = `| Business | Fit | Intent evidence | Sources | Suggested next step |
| --- | --- | --- | --- | --- |
| Cedar Vet Clinic | Veterinary, 12 staff | Asked for website recommendations (2026-11-14) | [post](https://example.net/p/1) | Offer a free audit |`;
  const [r] = parseProspectTable(md);
  assert.equal(r.name, "Cedar Vet Clinic");
  assert.match(r.signal, /website recommendations/);
  assert.equal(r.evidenceUrl, "https://example.net/p/1");
});

test("skips search-limitation rows the agent puts in the table", () => {
  const md = `| Rank | Business | Intent Evidence | Sources & Dates |
| --- | --- | --- | --- |
| 1 | Enable Dental | Hiring for booking workflow roles | RemoteOK listing (Nov 19, 2026) |
| 2 | Prospect Search Limitation | No verified public buying intent | Automated crawl |`;
  const rows = parseProspectTable(md);
  assert.deepEqual(rows.map((r) => r.name), ["Enable Dental"]);
  assert.equal(rows[0].evidenceDate, "Nov 19, 2026");
});
