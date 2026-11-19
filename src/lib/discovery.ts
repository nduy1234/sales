// Turns the Research Agent's Markdown prospect table into structured rows. Pure; no I/O.
export interface DiscoveredRow {
  name: string;
  fit: string;
  signal: string;
  evidenceUrl?: string;
  evidenceDate?: string;
  confidence: string;
  nextStep: string;
}

const strip = (s: string) =>
  s
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

function cells(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split(/(?<!\\)\|/).map((c) => c.trim());
}

export function parseProspectTable(md: string): DiscoveredRow[] {
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes("|") || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) continue;
    const head = cells(lines[i]).map((h) => strip(h).toLowerCase());
    const col = (re: RegExp) => head.findIndex((h) => re.test(h));
    const name = col(/prospect|company|account|business/);
    if (name < 0) continue;
    const fit = col(/fit/), signal = col(/signal|intent/), ev = col(/evidence|source|url|link/), conf = col(/confidence/), next = col(/next/);
    const rows: DiscoveredRow[] = [];
    for (let j = i + 2; j < lines.length && lines[j].includes("|"); j++) {
      const c = cells(lines[j]);
      const raw = (k: number) => (k >= 0 ? c[k] ?? "" : "");
      const n = strip(raw(name));
      if (!n || /^(none|n\/a|—|-|no (verified|qualifying|prospects?))/i.test(n)) continue;
      const evRaw = raw(ev);
      const url = evRaw.match(/\((https?:\/\/[^)\s]+)\)/)?.[1] ?? evRaw.match(/https?:\/\/[^\s|)<>]+/)?.[0];
      const date = evRaw.match(/\b(20\d{2}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2},? 20\d{2})\b/)?.[1];
      rows.push({ name: n.slice(0, 120), fit: strip(raw(fit)), signal: strip(raw(signal)), evidenceUrl: url, evidenceDate: date, confidence: strip(raw(conf)), nextStep: strip(raw(next)) });
    }
    if (rows.length) return rows;
  }
  return [];
}
