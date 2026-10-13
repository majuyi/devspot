import { createHash } from "node:crypto";

/** Query parameters that only say where a click came from (docs/04 §1 stage 2). */
const TRACKING_PARAM = /^(utm_.+|fbclid|ref)$/i;

/**
 * The URL dedupe keys on: lowercase host, no fragment, no tracking parameters, no trailing
 * slash on the path. The rest of the query is kept byte for byte, since on many sites it
 * names the page (`?id=42`).
 */
export function canonicalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  if (u.search) {
    const kept = u.search
      .slice(1)
      .split("&")
      .filter((pair) => pair && !TRACKING_PARAM.test(pair.split("=")[0] ?? ""));
    u.search = kept.length ? `?${kept.join("&")}` : "";
  }
  u.pathname = u.pathname.replace(/\/+$/, "") || "/";
  return u.href;
}

const DATE_TAIL = String.raw`[^\n]{0,30}?\b(?:19|20)\d{2}\b(?:-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?)?(?:,?\s*(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)?`;
/** "Last updated: 12 October 2026", "Updated on Oct 12, 2026 at 9:00 am" and the like. */
const LAST_UPDATED = new RegExp(
  String.raw`\b(last[ -](?:updated|modified|reviewed)|updated on|page updated)\b[:\s]*(?:on\s+)?${DATE_TAIL}`,
  "gi",
);

/** Text as the hash sees it: "last updated" dates removed, whitespace collapsed. */
export function normalizeText(text: string): string {
  return text.replace(LAST_UPDATED, "$1").replace(/\s+/g, " ").trim();
}

/** sha256 of the normalized text, hex. A page that only bumps its "last updated" keeps it. */
export function contentHash(text: string): string {
  return createHash("sha256").update(normalizeText(text)).digest("hex");
}
