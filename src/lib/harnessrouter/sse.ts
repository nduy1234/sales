// Pure helpers (no key, no I/O): SSE parsing and answer extraction.
export interface Annotation { type: string; file_id: string; filename: string; download_url?: string }
export interface OutputItem { id?: string; type: string; name?: string; content?: { type: string; text?: string; annotations?: Annotation[] }[] }
export interface HRResponse {
  id: string;
  status: string;
  output: OutputItem[];
  incomplete_details?: { reason?: string } | null;
  metadata?: { session_id?: string; [k: string]: unknown };
}
export interface StreamEvent { type: string; response?: HRResponse; delta?: string; item?: OutputItem; [k: string]: unknown }

export async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const take = (frame: string): StreamEvent | null => {
    const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).replace(/^ /, "")).join("\n").trim();
    if (!data || data === "[DONE]") return null;
    try {
      const ev = JSON.parse(data);
      return ev && typeof ev.type === "string" ? ev : null;
    } catch {
      return null;
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf = (buf + dec.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const ev = take(buf.slice(0, i));
        buf = buf.slice(i + 2);
        if (ev) yield ev;
      }
    }
    const tail = take(buf + dec.decode());
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** The answer is the output_text of the LAST message item. */
export function answerText(r: HRResponse): string {
  const msgs = (r.output ?? []).filter((i) => i.type === "message");
  return (msgs[msgs.length - 1]?.content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
}

