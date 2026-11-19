// Extract the first JSON object from model output (tolerates code fences / prose).
export function parseJson(text: string): unknown {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("no JSON object in model output");
  return JSON.parse(text.slice(s, e + 1));
}
