/** Rejects non-http(s), IP literals in private/loopback/link-local ranges, and local hostnames. */
export function isPublicHost(u: URL): boolean {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(h) || !h.includes(".") && !h.includes(":")) return false;
  if (h.includes(":")) return false; // IPv6 literals (::1, fc00::/7, fe80::/10, mapped v4) — not needed for websites
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return true;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return !(a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224);
}
