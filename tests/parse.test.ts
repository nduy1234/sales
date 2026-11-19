import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJson } from "../src/lib/json.ts";

test("parseJson extracts object from fenced/prose output", () => {
  assert.deepEqual(parseJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJson("no json here"));
});
