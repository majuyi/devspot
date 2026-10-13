/**
 * Date reading for the rules extractor (docs/05 §1). Only dates the text states: day, month
 * and, when given, year, time and time zone. A missing year is the next occurrence after the
 * reference date and the caller lowers its confidence. A date with no time means the end of
 * that day; with no time zone, the reader's (Africa/Lagos), as agreed on 2026-10-13.
 */

export const DEFAULT_ZONE = "Africa/Lagos";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Abbreviations sources use, to IANA zones. IST is India's: the sources that use it are. */
const ZONES: Record<string, string> = {
  wat: "Africa/Lagos",
  utc: "UTC",
  gmt: "UTC",
  bst: "Europe/London",
  cet: "Europe/Paris",
  cest: "Europe/Paris",
  eat: "Africa/Nairobi",
  cat: "Africa/Johannesburg",
  sast: "Africa/Johannesburg",
  est: "America/New_York",
  edt: "America/New_York",
  et: "America/New_York",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  ct: "America/Chicago",
  mst: "America/Denver",
  mdt: "America/Denver",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  ist: "Asia/Kolkata",
  aoe: "Etc/GMT+12",
};

const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const DAY = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const YEAR = String.raw`((?:19|20)\d{2})`;
// A time only when it looks like one (11:59, 5pm), so "25 January – 5 March" stays two dates.
const TIME = String.raw`(?:\s*,?\s*(?:@|at|by)?\s*(?=\d{1,2}(?:[:.]\d{2}|\s*[ap]\.?m\b))(\d{1,2})(?:[:.](\d{2}))?\s*([ap]\.?m\.?)?)?`;
const ZONE = String.raw`(?:\s*(?:GMT|UTC)\s*([+-]\d{1,2})(?::?(\d{2}))?|\s*\(?\b(${Object.keys(ZONES).join("|")})\b\)?)?`;

type Pattern = { re: RegExp; read: (m: RegExpExecArray) => Parts };
type Parts = { day: number; month: number; year?: number; time?: [number, number]; zone?: string };

function time(h?: string, min?: string, ampm?: string): [number, number] | undefined {
  if (h === undefined) return undefined;
  let hour = Number(h);
  const minute = min ? Number(min) : 0;
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith("p");
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  if (hour > 23 || minute > 59) return undefined;
  return [hour, minute];
}

function zone(abbr?: string, sign?: string, mins?: string): string | undefined {
  if (abbr) return ZONES[abbr.toLowerCase()];
  if (sign === undefined) return undefined;
  const h = Number(sign);
  if (mins && Number(mins) !== 0) return undefined;
  if (h === 0) return "UTC";
  // Etc/GMT signs are inverted: GMT+1 is Etc/GMT-1.
  return `Etc/GMT${h > 0 ? "-" : "+"}${Math.abs(h)}`;
}

const PATTERNS: Pattern[] = [
  // 2026-10-31, 2026-10-31T23:59
  {
    re: new RegExp(String.raw`\b${YEAR}-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?`, "gi"),
    read: (m) => ({
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      ...(m[4] ? { time: [Number(m[4]), Number(m[5])] as [number, number] } : {}),
    }),
  },
  // Friday, 31st October 2026 · 31 Oct, 2026 at 11:59pm WAT · 31 October
  {
    re: new RegExp(String.raw`\b${DAY}\s+(?:of\s+)?${MONTH}(?:,?\s+${YEAR})?${TIME}${ZONE}`, "gi"),
    read: (m) => parts(m[1], m[2], m[3], m.slice(4)),
  },
  // October 31, 2026 · Oct 31st 2026 @ 12:00pm PST · October 31
  {
    re: new RegExp(String.raw`\b${MONTH}\s+${DAY}(?!\d)(?:,?\s+${YEAR})?${TIME}${ZONE}`, "gi"),
    read: (m) => parts(m[2], m[1], m[3], m.slice(4)),
  },
  // 31/10/2026, read day first as Nigerian and British sources write it
  {
    re: new RegExp(String.raw`\b(\d{1,2})/(\d{1,2})/${YEAR}\b`, "g"),
    read: (m) => ({ day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) }),
  },
];

function parts(
  day: string | undefined,
  month: string | undefined,
  year: string | undefined,
  rest: (string | undefined)[],
): Parts {
  const [h, min, ampm, sign, mins, abbr] = rest;
  const t = time(h, min, ampm);
  const z = zone(abbr, sign, mins);
  return {
    day: Number(day),
    month: MONTHS[(month ?? "").toLowerCase().replace(/\.$/, "")] ?? 0,
    ...(year ? { year: Number(year) } : {}),
    ...(t ? { time: t } : {}),
    ...(z ? { zone: z } : {}),
  };
}

export type FoundDate = {
  /** UTC instant. */
  at: Date;
  /** IANA zone, only when the text stated one. */
  zone?: string;
  hasYear: boolean;
  hasTime: boolean;
  /** Where the match sits in the searched text, and what it said. */
  index: number;
  quote: string;
};

/**
 * Every date in `text`, in order of position. `reference` resolves a missing year to the
 * next occurrence on or after it. `endOfDay` decides what a date with no time means.
 */
export function findDates(
  text: string,
  reference: Date,
  { endOfDay = true }: { endOfDay?: boolean } = {},
): FoundDate[] {
  const found: FoundDate[] = [];
  const taken: Array<[number, number]> = [];
  for (const { re, read } of PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].trimEnd().length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      const p = read(m);
      const at = toInstant(p, reference, endOfDay);
      if (!at) continue;
      taken.push([start, end]);
      found.push({
        at,
        ...(p.zone ? { zone: p.zone } : {}),
        hasYear: p.year !== undefined,
        hasTime: p.time !== undefined,
        index: start,
        quote: text.slice(start, end),
      });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function toInstant(p: Parts, reference: Date, endOfDay: boolean): Date | undefined {
  if (p.month < 1 || p.month > 12 || p.day < 1 || p.day > 31) return undefined;
  const zoneName = p.zone ?? DEFAULT_ZONE;
  const [hour, minute] = p.time ?? (endOfDay ? [23, 59] : [0, 0]);
  const at = (year: number) => {
    // Reject 31 February and friends rather than letting Date roll them over.
    const probe = new Date(Date.UTC(year, p.month - 1, p.day));
    if (probe.getUTCMonth() !== p.month - 1) return undefined;
    return zonedTime(year, p.month, p.day, hour, minute, zoneName);
  };
  if (p.year !== undefined) return at(p.year);
  const year = reference.getUTCFullYear();
  const thisYear = at(year);
  if (thisYear && thisYear.getTime() >= reference.getTime()) return thisYear;
  return at(year + 1);
}

/** The UTC instant of a wall-clock time in an IANA zone, without a date library. */
export function zonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zoneName: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes settle the offset across a daylight-saving change.
  let at = guess - offsetMs(guess, zoneName);
  at = guess - offsetMs(at, zoneName);
  return new Date(at);
}

function offsetMs(instant: number, zoneName: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zoneName,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const get = (type: string) =>
    Number(fmt.formatToParts(new Date(instant)).find((x) => x.type === type)?.value);
  const wall = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wall - Math.floor(instant / 1000) * 1000;
}
