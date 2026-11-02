import { ItemFilter, type RawItemInput } from "@devspot/schema";

/** Titles that say the role is beyond 0 to 2 years. */
export const SENIOR_TITLE =
  /\b(?:senior|sr|lead|principal|head|manager|director|vp|vice[- ]president|chief|staff|architect)\b/i;

/** Titles that say the role is entry-level, which wins over SENIOR_TITLE ("Associate Product Manager"). */
export const ENTRY_TITLE =
  /\b(?:intern|internship|graduate|junior|jr|entry[- ]level|trainee|associate|apprentice)\b/i;

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What the filter reads of an item: enough that an adapter can ask before fetching detail. */
export type Listed = {
  title?: string | undefined;
  department?: string | undefined;
  /** ISO alpha-2. */
  country?: string | undefined;
  /** The board's own seniority label ("Entry level", "Mid-Senior level"), when it has one. */
  level?: string | undefined;
};

/** Compiled once per source: keyword regexes and a department set. */
export function itemMatcher(filter: ItemFilter | undefined): (item: Listed) => boolean {
  if (!filter) return () => true;
  const departments = filter.departments && new Set(filter.departments.map(norm));
  const titles =
    filter.titles &&
    new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${filter.titles.map((t) => escapeRegExp(norm(t))).join("|")})(?![\\p{L}\\p{N}])`,
      "iu",
    );
  const countries = filter.countries && new Set(filter.countries);
  return ({ title = "", department, country, level = "" }) => {
    if (countries && country && !countries.has(country.toUpperCase())) return false;
    if (departments || titles) {
      const byDepartment = Boolean(departments && department && departments.has(norm(department)));
      const byTitle = Boolean(titles?.test(norm(title)));
      if (!byDepartment && !byTitle) return false;
    }
    if (filter.seniority === "early") {
      const senior = SENIOR_TITLE.test(title) || SENIOR_TITLE.test(level);
      if (senior && !ENTRY_TITLE.test(title) && !ENTRY_TITLE.test(level)) return false;
    }
    return true;
  };
}

const listed = (item: RawItemInput): Listed => {
  const { department, country, level } = item.meta ?? {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    title: item.title,
    department: str(department),
    country: str(country),
    level: str(level),
  };
};

/**
 * Applied right after fetch, so a dropped item is never stored. Adapters still return every
 * listed item (docs/04 §1), except that an adapter spending a request per item may ask
 * `itemMatcher` first so dropped roles do not use up its per-run cap.
 */
export function applyItemFilter(
  items: readonly RawItemInput[],
  filter: ItemFilter | undefined,
): { kept: RawItemInput[]; dropped: number } {
  const keep = itemMatcher(filter);
  const kept = items.filter((item) => keep(listed(item)));
  return { kept, dropped: items.length - kept.length };
}

export class InvalidItemFilter extends Error {
  override readonly name = "InvalidItemFilter";
  constructor(readonly issues: string) {
    super(`Source.filter does not parse: ${issues}`);
  }
}

/**
 * `Source.filter` is JSON in the database, written from validated YAML. If it ever fails to
 * parse, the source fails loudly rather than running unfiltered and flooding review.
 */
export function parseItemFilter(json: unknown): ItemFilter | undefined {
  if (json === null || json === undefined) return undefined;
  const parsed = ItemFilter.safeParse(json);
  if (!parsed.success) throw new InvalidItemFilter(parsed.error.message);
  return parsed.data;
}
