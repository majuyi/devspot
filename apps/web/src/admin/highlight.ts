import { CITIES } from "@devspot/schema";

export type Segment = { text: string; mark: "date" | "place" | null };

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

/**
 * The source text cut into runs, with the dates and place words a reviewer checks first
 * marked (docs/01 §4). A reading aid only: it marks words, it does not decide anything.
 */
export function highlight(text: string): Segment[] {
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
