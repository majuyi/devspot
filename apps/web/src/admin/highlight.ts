import { CITIES } from "@devspot/schema";

export type Segment = {
  text: string;
  mark: "evidence" | "date" | "place" | null;
  /** For evidence: the fields the extractor read from this quote. */
  fields?: string[];
};

export type Evidence = { field: string; quote: string };

const MONTH =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const DATE = [
  // 5 November 2026, 5th Nov
  `\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH}\\b(?:,?\\s+\\d{4})?`,
  // November 5, 2026
  `\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b(?:,?\\s+\\d{4})?`,
  "\\b\\d{4}-\\d{2}-\\d{2}\\b",
  "\\b\\d{1,2}/\\d{1,2}/\\d{2,4}\\b",
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PLACE_WORDS = [
  ...CITIES.flatMap((c) => [c.name, ...c.aliases]),
  "nigeria",
  "nationwide",
  "remote",
  "hybrid",
  "on-site",
  "onsite",
  "in-person",
  "virtual",
  "online",
];
const PLACE = `\\b(?:${[...new Set(PLACE_WORDS.map((w) => w.toLowerCase()))]
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|")})\\b`;

const PATTERN = new RegExp(`(${DATE.join("|")})|(${PLACE})`, "gi");

/** Dates and place words in a run of text with no evidence in it. */
function marks(text: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), mark: null });
    out.push({ text: m[0], mark: m[1] ? "date" : "place" });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mark: null });
  return out;
}

/** Where each quote first appears, longest first so a quote inside another merges into it. */
function quoteSpans(text: string, evidence: Evidence[]) {
  const spans: Array<{ start: number; end: number; fields: string[] }> = [];
  for (const { field, quote } of [...evidence].sort((a, b) => b.quote.length - a.quote.length)) {
    if (!quote) continue;
    const start = text.indexOf(quote);
    if (start < 0) continue;
    const end = start + quote.length;
    const holder = spans.find((s) => start >= s.start && end <= s.end);
    if (holder) {
      if (!holder.fields.includes(field)) holder.fields.push(field);
      continue;
    }
    if (spans.some((s) => start < s.end && end > s.start)) continue;
    spans.push({ start, end, fields: [field] });
  }
  return spans.sort((a, b) => a.start - b.start);
}

/** The evidence quotes that are really in the text, by field. A quote not found is not evidence. */
export function quotesFound(text: string, evidence: Evidence[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const { field, quote } of evidence) {
    if (quote && text.includes(quote) && !found.has(field)) found.set(field, quote);
  }
  return found;
}

/**
 * The source text cut into runs (docs/05 §3): first the quotes the extractor took each field
 * from, then, between them, the dates and place words a reviewer checks first (docs/01 §4).
 * A reading aid only: it marks words, it does not decide anything.
 */
export function highlight(text: string, evidence: Evidence[] = []): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const span of quoteSpans(text, evidence)) {
    if (span.start > last) out.push(...marks(text.slice(last, span.start)));
    out.push({ text: text.slice(span.start, span.end), mark: "evidence", fields: span.fields });
    last = span.end;
  }
  if (last < text.length) out.push(...marks(text.slice(last)));
  return out;
}

/** The evidence list stored with an extracted row, read defensively: it is JSON from the engine. */
export function storedEvidence(extracted: unknown): Evidence[] {
  const list = (extracted as { evidence?: unknown } | null)?.evidence;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (e): e is Evidence =>
      typeof e === "object" &&
      e !== null &&
      typeof (e as Evidence).field === "string" &&
      typeof (e as Evidence).quote === "string",
  );
}

/** Form field, the evidence field the engine writes for it, and whether the row has a value. */
type Sourced = {
  deadlineAt: Date | null;
  startsAt: Date | null;
  locationMode: string | null;
  requirementsText: string | null;
};
const SOURCED = [
  ["deadlineAt", "deadline"],
  ["startsAt", "startsAt"],
  ["locationMode", "locationMode"],
  ["requirementsText", "requirementsText"],
] as const;

/**
 * Each quotable field's quote, or null when it has a value no quote in the text backs: the
 * reviewer is warned, and the value is kept (rules take kind, title and an organisation's
 * default place with no quote, so blanking would mean retyping most items).
 */
export function fieldSources(row: Sourced, found: Map<string, string>) {
  const out: Partial<Record<keyof Sourced, string | null>> = {};
  for (const [formField, evidenceField] of SOURCED) {
    const quote = found.get(evidenceField);
    const value = row[formField];
    if (quote) out[formField] = quote;
    else if (value !== null && value !== "") out[formField] = null;
  }
  return out;
}
