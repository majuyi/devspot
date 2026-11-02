import { ItemFilter, type RawItemInput } from "@devspot/schema";

/** Titles that say the role is beyond 0 to 2 years. */
export const SENIOR_TITLE =
  /\b(?:senior|sr|lead|principal|head|manager|director|vp|vice[- ]president|chief|staff)\b/i;

/** Titles that say the role is entry-level, which wins over SENIOR_TITLE ("Associate Product Manager"). */
export const ENTRY_TITLE =
  /\b(?:intern|internship|graduate|junior|jr|entry[- ]level|trainee|associate|apprentice)\b/i;

const norm = (s: string) => s.trim().toLowerCase();

function department(item: RawItemInput): string | undefined {
  const d = item.meta?.department;
  return typeof d === "string" && d.trim() ? norm(d) : undefined;
}

/**
 * Applied right after fetch, so a dropped item is never stored. Adapters still return every
 * listed item (docs/04 §1), which keeps fixtures complete and the filter testable on its own.
 * A department filter drops items with no department: the adapter could not say.
 */
export function applyItemFilter(
  items: readonly RawItemInput[],
  filter: ItemFilter | undefined,
): { kept: RawItemInput[]; dropped: number } {
  if (!filter) return { kept: [...items], dropped: 0 };
  const departments = filter.departments && new Set(filter.departments.map(norm));
  const kept = items.filter((item) => {
    if (departments) {
      const d = department(item);
      if (!d || !departments.has(d)) return false;
    }
    if (filter.seniority === "early") {
      const title = item.title ?? "";
      if (SENIOR_TITLE.test(title) && !ENTRY_TITLE.test(title)) return false;
    }
    return true;
  });
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
