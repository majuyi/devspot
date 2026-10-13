import {
  CITIES,
  type DeadlineKind,
  type LocationMode,
  type OpportunityDraft,
  type OpportunityKind,
  type OrgCategory,
  TAGS,
  type Tag,
} from "@devspot/schema";
import { type FoundDate, findDates } from "./dates.js";

/** What the rules read: one RawItem and its organization. No database, no network. */
export type RulesInput = {
  item: {
    title?: string | null;
    text: string;
    canonicalUrl: string;
    publishedAt?: Date | null;
    meta?: unknown;
  };
  org: { category: OrgCategory; country: string; city?: string | null };
  /** "Today" when the item has no publish date. Injected so tests are stable. */
  now?: Date;
};

export type RulesResult = { draft: OpportunityDraft; confidence: number };

/** At M1 an item publishes on rules alone at this overall confidence (docs/05 §1). */
export const RULES_PUBLISH_THRESHOLD = 0.75;

type Field<T> = { value: T; confidence: number; quote?: string };
const none = <T>(value: T): Field<T> => ({ value, confidence: 0 });

// ---------------------------------------------------------------------------------- kind

/** Phrases per kind with weights. Order breaks ties: earlier kinds are more specific. */
const KIND_PHRASES: Array<[OpportunityKind, Array<[RegExp, number]>]> = [
  [
    "ossProgram",
    [
      [/\bgoogle summer of code\b|\bgsoc\b/i, 3],
      [/\boutreachy\b|\blfx mentorship\b|\bseason of docs\b/i, 3],
      [/\bopen[- ]source (?:programme|program|mentorship|internship|fellowship)\b/i, 2],
    ],
  ],
  [
    "hackathon",
    [
      [/\bhackathons?\b|\bhacks?\b/i, 3],
      // "WarriorHacks" counts and "shack" does not, so this one is case-sensitive.
      [/(?<=[a-z])Hacks?\b/, 3],
    ],
  ],
  ["internship", [[/\binternships?\b|\binterns?\b|\bsiwes\b|\bindustrial training\b/i, 3]]],
  ["fellowship", [[/\bfellowships?\b/i, 3]]],
  ["scholarship", [[/\bscholarships?\b|\bbursar(?:y|ies)\b/i, 3]]],
  ["grant", [[/\bgrants?\b|\bequity[- ]free funding\b/i, 2]]],
  ["accelerator", [[/\baccelerators?\b|\bincubat(?:or|ion)\b/i, 3]]],
  [
    "bootcamp",
    [
      [/\bboot ?camps?\b/i, 3],
      [/\btraining programme\b|\btraining program\b|\bacademy\b/i, 1],
    ],
  ],
  [
    "competition",
    [
      [/\bcompetitions?\b|\bcontests?\b/i, 2],
      [/\bchallenge\b/i, 1],
    ],
  ],
  [
    "job",
    [
      [/\bvacanc(?:y|ies)\b|\bwe(?:'re| are) hiring\b|\bjob openings?\b|\bfull[- ]time\b/i, 2],
      [/\bgraduate (?:trainee|programme|program)\b|\bexpressions? of interest\b/i, 2],
      [/\bconsultants?\b|\bjobs?\b|\broles?\b/i, 1],
    ],
  ],
  [
    "event",
    [
      [/\bmeet-?ups?\b|\bconferences?\b|\bsummits?\b|\bdevfest\b/i, 2],
      [/\bworkshops?\b|\bwebinars?\b|\bmasterclass(?:es)?\b|\bfestival\b/i, 1],
    ],
  ],
];

const CATEGORY_PRIOR: Partial<Record<OrgCategory, OpportunityKind>> = {
  employer: "job",
  ossProgram: "ossProgram",
  fellowshipFunder: "fellowship",
  scholarshipFunder: "scholarship",
  hackathonHost: "hackathon",
  accelerator: "accelerator",
  trainingProvider: "bootcamp",
};

function scoreKinds(text: string): Map<OpportunityKind, number> {
  const scores = new Map<OpportunityKind, number>();
  for (const [kind, phrases] of KIND_PHRASES) {
    let score = 0;
    for (const [re, weight] of phrases) {
      const matches = text.match(new RegExp(re.source, `${re.flags}g`));
      if (matches) score += weight * Math.min(matches.length, 3);
    }
    if (score > 0) scores.set(kind, score);
  }
  return scores;
}

function best(scores: Map<OpportunityKind, number>): OpportunityKind | undefined {
  let top: OpportunityKind | undefined;
  for (const [kind, score] of scores) if (!top || score > (scores.get(top) ?? 0)) top = kind;
  return top;
}

export function ruleKind(
  title: string,
  text: string,
  category: OrgCategory,
): Field<OpportunityKind | undefined> {
  const inTitle = scoreKinds(title);
  if (inTitle.size === 1) return { value: best(inTitle), confidence: 0.9 };
  if (inTitle.size > 1) return { value: best(inTitle), confidence: 0.6 };
  const inText = best(scoreKinds(text));
  if (inText) return { value: inText, confidence: 0.6 };
  const prior = CATEGORY_PRIOR[category];
  return prior ? { value: prior, confidence: 0.4 } : none(undefined);
}

// ------------------------------------------------------------------------------ deadline

const DEADLINE_ANCHOR =
  /\b(?:deadline|closing date|closes?|closing|apply by|applications? (?:close|closes|are due|due)|submissions? (?:close|closes|due)|last date|due (?:date|by)|until|open through)\b/gi;
const ROLLING =
  /\brolling\b|\buntil (?:the (?:role|position) is |positions? (?:are|is) )?filled\b/i;
const NEAR = 80;

export type DeadlineField = {
  kind: DeadlineKind;
  at?: Date;
  zone?: string;
  confidence: number;
  quote?: string;
};

/**
 * A deadline is a date within 80 characters after an anchor word. Dates before the reference
 * (publish date, else now) are dropped: a past date is not a deadline someone can meet.
 */
export function ruleDeadline(text: string, reference: Date): DeadlineField {
  const anchored: FoundDate[] = [];
  DEADLINE_ANCHOR.lastIndex = 0;
  for (let m = DEADLINE_ANCHOR.exec(text); m; m = DEADLINE_ANCHOR.exec(text)) {
    const from = m.index + m[0].length;
    const window = text.slice(from, from + NEAR);
    const [first] = findDates(window, reference);
    if (first) anchored.push({ ...first, index: from + first.index });
  }
  const future = anchored.filter((d) => d.at.getTime() >= reference.getTime());

  const rounds = /\brounds?\b/i.test(text);
  const distinct = [...new Map(future.map((d) => [d.at.getTime(), d])).values()];
  if (rounds && distinct.length >= 2) {
    const next = distinct.sort((a, b) => a.at.getTime() - b.at.getTime())[0] as FoundDate;
    return dated("multiRound", next, 0.7);
  }
  const [first] = future;
  if (first) return dated("fixed", first, first.hasYear ? 0.85 : 0.6);

  const rolling = text.match(ROLLING);
  if (
    rolling &&
    /\bapplications?\b|\bapply\b|\brecruit/i.test(around(text, rolling.index ?? 0, 120))
  )
    return { kind: "rolling", confidence: 0.7, quote: rolling[0] };
  return { kind: "unknown", confidence: 0 };
}

function dated(kind: DeadlineKind, d: FoundDate, confidence: number): DeadlineField {
  return {
    kind,
    at: d.at,
    ...(d.zone ? { zone: d.zone } : {}),
    confidence,
    quote: d.quote,
  };
}

function around(text: string, index: number, radius: number): string {
  return text.slice(Math.max(0, index - radius), index + radius);
}

// ------------------------------------------------------------------------- starts / ends

const MONTH_NAME = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const RANGES: Array<{
  re: RegExp;
  read: (m: RegExpExecArray) => [string, string, string, string, string?];
}> = [
  // 3–5 October 2026 → [d1, m1, d2, m2, year]
  {
    re: new RegExp(
      String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH_NAME}(?:,?\s+((?:19|20)\d{2}))?`,
      "gi",
    ),
    read: (m) => [m[1] ?? "", m[3] ?? "", m[2] ?? "", m[3] ?? "", m[4]],
  },
  // 25 January – 5 March 2027
  {
    re: new RegExp(
      String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH_NAME}\s*(?:-|–|—|to)\s*(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH_NAME}(?:,?\s+((?:19|20)\d{2}))?`,
      "gi",
    ),
    read: (m) => [m[1] ?? "", m[2] ?? "", m[3] ?? "", m[4] ?? "", m[5]],
  },
  // October 3 to 5, 2026 · Oct 3 - Nov 5, 2026
  {
    re: new RegExp(
      String.raw`\b${MONTH_NAME}\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:-|–|—|to)\s*(?:${MONTH_NAME}\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+((?:19|20)\d{2}))?`,
      "gi",
    ),
    read: (m) => [m[2] ?? "", m[1] ?? "", m[4] ?? "", m[3] ?? m[1] ?? "", m[5]],
  },
];

export type SpanField = { starts?: Date; ends?: Date; confidence: number; quote?: string };

/** Event and bootcamp dates: a range, else a single date after "on" or "date:". */
export function ruleSpan(text: string, reference: Date): SpanField {
  for (const { re, read } of RANGES) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    const [d1, m1, d2, m2, year] = read(m);
    const starts = findDates(`${d1} ${m1}${year ? ` ${year}` : ""}`, reference, {
      endOfDay: false,
    })[0];
    const ends = findDates(`${d2} ${m2}${year ? ` ${year}` : ""}`, reference)[0];
    if (!starts || !ends) continue;
    // "25 January – 5 March 2027": the year belongs to both ends.
    let startAt = starts.at;
    if (startAt.getTime() > ends.at.getTime())
      startAt = new Date(
        Date.UTC(
          startAt.getUTCFullYear() - 1,
          startAt.getUTCMonth(),
          startAt.getUTCDate(),
          startAt.getUTCHours(),
          startAt.getUTCMinutes(),
        ),
      );
    return { starts: startAt, ends: ends.at, confidence: year ? 0.8 : 0.5, quote: m[0] };
  }
  const single = /\b(?:on|date:|dates?:|holds? on|takes place on)\s+/gi;
  for (let m = single.exec(text); m; m = single.exec(text)) {
    const from = m.index + m[0].length;
    const [d] = findDates(text.slice(from, from + 40), reference, { endOfDay: false });
    // The date must follow directly, a weekday aside: "on Saturday, 3 October 2026".
    if (d && /^(?:\w+,?\s*)?$/.test(text.slice(from, from + d.index)))
      return { starts: d.at, confidence: d.hasYear ? 0.8 : 0.5, quote: d.quote };
  }
  return { confidence: 0 };
}

// ------------------------------------------------------------------------------ location

const REMOTE_TITLE = /\b(?:remote|virtual|online)\b/i;
const REMOTE_TEXT = [
  /\b(?:remote|remotely|virtual|virtually)\b/i,
  /\b(?:location|venue|format|mode)\s*:\s*(?:online|remote|virtual)\b/i,
  /\b(?:held|hosted|run|takes place|fully|100%|entirely)\s+online\b/i,
  /\bonline\s+(?:event|hackathon|programme|program|bootcamp|course|cohort|internship|competition|sessions?|classes)\b/i,
];
const HYBRID = /\bhybrid\b/i;

export type LocationField = {
  mode?: LocationMode;
  city?: string;
  country?: string;
  confidence: number;
  quote?: string;
};

function findCity(text: string): { slug: string; quote: string } | undefined {
  const lower = text.toLowerCase();
  let hit: { slug: string; quote: string; index: number } | undefined;
  for (const city of CITIES) {
    for (const alias of city.aliases) {
      const re = new RegExp(String.raw`(?<![\w.])${alias.replace(/[.]/g, "\\.")}(?![\w])`, "i");
      const m = re.exec(lower);
      if (m && (!hit || m.index < hit.index))
        hit = {
          slug: city.slug,
          quote: text.slice(m.index, m.index + alias.length),
          index: m.index,
        };
    }
  }
  return hit && { slug: hit.slug, quote: hit.quote };
}

export function ruleLocation(title: string, text: string, org: RulesInput["org"]): LocationField {
  const nigeria = /\bnigerian?s?\b|\bnationwide\b/i.test(`${title}\n${text}`);
  const country = nigeria ? { country: "NG" } : {};
  for (const [source, confidence] of [
    [title, 0.9],
    [text, 0.7],
  ] as const) {
    const remote =
      source === title
        ? source.match(REMOTE_TITLE)
        : REMOTE_TEXT.map((re) => source.match(re)).find(Boolean);
    const hybrid = source.match(HYBRID);
    const city = findCity(source);
    if (hybrid)
      return { mode: "hybrid", ...cityOf(city), ...country, confidence, quote: hybrid[0] };
    if (remote) return { mode: "remote", ...country, confidence, quote: remote[0] };
    if (city) return { mode: "onsite", ...cityOf(city), confidence, quote: city.quote };
  }
  if (org.city) return { mode: "onsite", city: org.city, country: org.country, confidence: 0.3 };
  return { ...country, confidence: 0 };
}

function cityOf(city: { slug: string } | undefined): { city?: string; country?: string } {
  return city ? { city: city.slug, country: "NG" } : {};
}

// --------------------------------------------------------------------------------- venue

export function ruleVenue(text: string): { name?: string; address?: string; confidence: number } {
  const m = text.match(/^(?:venue|location)\s*:\s*(.+)$/im);
  const line = m?.[1]?.trim();
  if (!line || /^(?:online|remote|virtual|tba|tbd)\b/i.test(line)) return { confidence: 0 };
  const [name, ...rest] = line.split(/,\s*/);
  return {
    name: (name ?? line).slice(0, 200),
    ...(rest.length ? { address: rest.join(", ").slice(0, 300) } : {}),
    confidence: 0.6,
  };
}

// -------------------------------------------------------------------------- requirements

const REQUIREMENTS_HEADING =
  /^(?:requirements?|eligibility(?: criteria| requirements)?|who (?:can|should|is eligible to) (?:apply|participate)\??|(?:selection |eligibility )?criteria|who is eligible\??|who we(?:'|’)re looking for|qualifications)\s*:?\s*$/i;
const REQUIREMENTS_MAX = 1500;

/** A block that starts like a heading: a short first line, not a list item, no end mark. */
function isHeading(block: string): boolean {
  const first = block.split("\n")[0] ?? "";
  return (
    first.length > 0 && first.length <= 80 && !first.startsWith("- ") && !/[.,;:]$/.test(first)
  );
}

/**
 * The text under a requirements heading, up to the next heading or 1,500 characters, copied
 * verbatim: a slice of the input, never rebuilt. Never synthesized when there is no heading.
 */
export function ruleRequirements(text: string): Field<string | undefined> {
  const blocks: Array<{ text: string; start: number }> = [];
  const re = /[^\n]+(?:\n(?!\n)[^\n]*)*/g;
  for (let m = re.exec(text); m; m = re.exec(text)) blocks.push({ text: m[0], start: m.index });
  const at = blocks.findIndex((b) => REQUIREMENTS_HEADING.test(b.text.trim()));
  if (at < 0) return none(undefined);
  const first = blocks[at + 1];
  if (!first) return none(undefined);
  let end = first.start + first.text.length;
  for (const b of blocks.slice(at + 2)) {
    if (isHeading(b.text.trim()) || b.start + b.text.length - first.start > REQUIREMENTS_MAX) break;
    end = b.start + b.text.length;
  }
  let value = text.slice(first.start, end);
  if (value.length > REQUIREMENTS_MAX) {
    const cut = value.lastIndexOf("\n", REQUIREMENTS_MAX);
    value = value.slice(0, cut > 0 ? cut : REQUIREMENTS_MAX);
  }
  return { value: value.trimEnd(), confidence: 0.9, quote: value.trimEnd() };
}

// ------------------------------------------------------------------------------ apply url

const APPLY_TEXT = /\b(?:apply|register|registration|submit|sign up|signup)\b/i;
const APPLY_HREF = /apply|register|forms\.|\/forms\/|airtable\.com|typeform\.com/i;

export function ruleApplyUrl(meta: unknown): Field<string | undefined> {
  const links = readLinks(meta);
  const hit =
    links.find((l) => APPLY_TEXT.test(l.text)) ?? links.find((l) => APPLY_HREF.test(l.href));
  return hit ? { value: hit.href, confidence: 0.8, quote: hit.text || hit.href } : none(undefined);
}

function readLinks(meta: unknown): Array<{ text: string; href: string }> {
  const links = (meta as { links?: unknown } | null | undefined)?.links;
  if (!Array.isArray(links)) return [];
  return links.flatMap((l) => {
    const { text, href } = (l ?? {}) as { text?: unknown; href?: unknown };
    return typeof href === "string" && /^https?:/i.test(href)
      ? [{ text: typeof text === "string" ? text : "", href }]
      : [];
  });
}

// ----------------------------------------------------------------------- tags and regions

const TAG_PATTERNS: Record<Tag, RegExp> = {
  backend: /\bback[- ]?end\b/i,
  frontend: /\bfront[- ]?end\b/i,
  mobile: /\b(?:mobile (?:app|development|developer)s?|android|ios|flutter|react native)\b/i,
  data: /\bdata (?:science|scientists?|analy(?:sis|tics|st)|engineer(?:ing)?)\b/i,
  ml: /\b(?:machine learning|deep learning|artificial intelligence)\b|\bAI\b/,
  design: /\b(?:ui\/ux|ux|product design(?:er)?|graphic design)\b/i,
  product: /\bproduct manage(?:r|ment)\b/i,
  devops: /\b(?:devops|devsecops|cloud engineering|site reliability|kubernetes)\b/i,
  security: /\bcyber ?security\b|\binformation security\b/i,
  web3: /\b(?:web3|blockchain|crypto(?:currency)?)\b/i,
  "women-in-tech": /\b(?:women|female|girls)\b/i,
  "students-only": /\bstudents? only\b|\bmust be (?:a |an )?(?:currently )?enrolled\b/i,
  "final-year": /\bfinal[- ]year\b/i,
  stipend: /\bstipends?\b/i,
  "fully-funded": /\bfully[- ]funded\b/i,
  free: /\bfree (?:of charge|to (?:attend|join|apply|participate))\b|\bno (?:application )?fees?\b/i,
};

export function ruleTags(title: string, text: string): Tag[] {
  const all = `${title}\n${text}`;
  return TAGS.filter((t) => TAG_PATTERNS[t].test(all));
}

const REGIONS: Array<[string, RegExp]> = [
  ["west-africa", /\bwest africa(?:n)?\b/i],
  ["africa", /\bafrica(?:n)?\b/i],
  ["nigeria", /\bnigerian?s?\b/i],
  ["global", /\bglobal(?:ly)?\b|\bworldwide\b|\ball countries\b/i],
];

export function ruleRegions(title: string, text: string): string[] {
  const all = `${title}\n${text}`;
  return REGIONS.filter(([, re]) => re.test(all)).map(([tag]) => tag);
}

// -------------------------------------------------------------------------------- summary

/** Words a summary must never contain (docs/05 §2): only the source may speak to eligibility. */
export const ELIGIBILITY_WORDS = /\beligib(?:le|ility)\b|\bqualif(?:y|ies|ied)\b|\bopen to\b/i;
const SUMMARY_MAX = 280;

/** The first prose paragraph, cut at a sentence boundary, skipping any with eligibility words. */
export function ruleSummary(text: string): Field<string | undefined> {
  for (const block of text.split(/\n{2,}/)) {
    const para = block.trim();
    if (para.length < 60 || para.includes("\n") || para.startsWith("- ")) continue;
    if (!/[.!?]["”’)]?$/.test(para) && !/[.!?]\s/.test(para)) continue;
    if (ELIGIBILITY_WORDS.test(para)) continue;
    return { value: cutAtSentence(para), confidence: 0.5 };
  }
  return none(undefined);
}

function cutAtSentence(para: string): string {
  if (para.length <= SUMMARY_MAX) return para;
  const window = para.slice(0, SUMMARY_MAX);
  const end = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf("! "),
    window.lastIndexOf("? "),
  );
  if (end > 40) return window.slice(0, end + 1);
  const space = window.lastIndexOf(" ");
  return `${window.slice(0, space > 0 ? space : SUMMARY_MAX - 1)}…`;
}

// ---------------------------------------------------------------------------------- draft

/**
 * Rules-only extraction (docs/05 §1): every field with its confidence, and the overall
 * `min(kind, max(deadline, start), locationMode)`, less 0.15 without requirements.
 */
export function extractRules({ item, org, now = new Date() }: RulesInput): RulesResult {
  const title = (item.title ?? "").trim();
  const reference = item.publishedAt ?? now;
  const kind = ruleKind(title, item.text, org.category);
  const deadline = ruleDeadline(item.text, reference);
  const span =
    kind.value === "event" || kind.value === "bootcamp"
      ? ruleSpan(item.text, reference)
      : { confidence: 0 };
  const location = ruleLocation(title, item.text, org);
  const venue = kind.value === "event" ? ruleVenue(item.text) : { confidence: 0 };
  const requirements = ruleRequirements(item.text);
  const apply = ruleApplyUrl(item.meta);
  const tags = ruleTags(title, item.text);
  const regions = ruleRegions(title, item.text);
  const summary = ruleSummary(item.text);

  const fieldConfidence: Record<string, number> = {
    kind: kind.confidence,
    deadline: deadline.confidence,
    startsAt: span.confidence,
    locationMode: location.confidence,
    venue: venue.confidence,
    requirementsText: requirements.confidence,
    applyUrl: apply.confidence,
    tags: tags.length ? 0.7 : 0,
    summary: summary.confidence,
    regionsTags: regions.length ? 0.6 : 0,
  };
  const evidence = [
    deadline.quote && { field: "deadline", quote: deadline.quote },
    "quote" in span && span.quote && { field: "startsAt", quote: span.quote },
    location.quote && { field: "locationMode", quote: location.quote },
    requirements.quote && { field: "requirementsText", quote: requirements.quote },
    apply.quote && { field: "applyUrl", quote: apply.quote },
  ].filter((e): e is { field: string; quote: string } => Boolean(e));

  const draft: OpportunityDraft = {
    isOpportunity: true,
    title: title.length >= 3 ? title : item.canonicalUrl,
    canonicalUrl: item.canonicalUrl,
    ...(apply.value ? { applyUrl: apply.value } : {}),
    ...(kind.value ? { kind: kind.value } : {}),
    ...(summary.value ? { summary: summary.value } : {}),
    deadlineKind: deadline.kind,
    ...(deadline.at ? { deadlineAt: deadline.at.toISOString() } : {}),
    ...(deadline.zone ? { deadlineTimezone: deadline.zone } : {}),
    ...("starts" in span && span.starts ? { startsAt: span.starts.toISOString() } : {}),
    ...("ends" in span && span.ends ? { endsAt: span.ends.toISOString() } : {}),
    ...(location.mode ? { locationMode: location.mode } : {}),
    ...(location.country ? { country: location.country } : {}),
    ...(location.city ? { city: location.city } : {}),
    ...("name" in venue && venue.name ? { venueName: venue.name } : {}),
    ...("address" in venue && venue.address ? { venueAddress: venue.address } : {}),
    regionsTags: regions,
    ...(requirements.value ? { requirementsText: requirements.value } : {}),
    tags,
    fieldConfidence,
    evidence,
  };

  const dated = Math.max(deadline.confidence, span.confidence);
  const overall = Math.min(kind.confidence, dated, location.confidence);
  const confidence = Math.max(0, overall - (requirements.value ? 0 : 0.15));
  return { draft, confidence: Math.round(confidence * 100) / 100 };
}
