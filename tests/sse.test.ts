import { test } from "node:test";
import assert from "node:assert/strict";
import { answerText, parseSSE } from "../src/lib/harnessrouter/sse.ts";

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({ start(c) { for (const x of chunks) c.enqueue(enc.encode(x)); c.close(); } });
}

test("parseSSE handles split frames, CRLF, [DONE] and junk", async () => {
  const s = streamOf(['data: {"type":"response.created","response":{"id":"r1"}}\r\n', "\r\ndata: {\"type\":\"response.output_text.delta\",", '"delta":"Hi"}\n\ndata: not-json\n\ndata: [DONE]\n\n']);
  const out = [];
  for await (const e of parseSSE(s)) out.push(e.type);
  assert.deepEqual(out, ["response.created", "response.output_text.delta"]);
});

test("answerText takes the last message item only", () => {
  const r = { id: "r", status: "completed", output: [
    { type: "message", content: [{ type: "output_text", text: "progress note" }] },
    { type: "function_call", name: "bash" },
    { type: "message", content: [{ type: "output_text", text: "Final " }, { type: "output_text", text: "answer" }] },
  ] };
  assert.equal(answerText(r), "Final answer");
});
