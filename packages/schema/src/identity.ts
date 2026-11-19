import type { OpportunityInput } from "./opportunity.js";

/**
 * How an opportunity is named and recognised (docs/04 §1 stage 5, docs/01 §1 URLs). Here,
 * not in the engine, because /admin/new must compute the same keys for a hand-entered item,
 * or duplicate detection between the two would break.
 */
const SLUG_TITLE_MAX = 60;

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The title with what changes between cycles removed: years, cohort numbers, punctuation. */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b(?:cohort|batch|season|edition|class|intake)\s*#?\s*(?:\d+|[ivx]+)\b/gi, " ")
    .replace(/\b\d+(?:st|nd|rd|th)\s+(?:cohort|batch|season|edition|class|intake)\b/gi, " ")
    .replace(/[^\p{L}\p{N}'’]+/gu, " ")
    .replace(/\s+\d+\s*$/, "")
    .trim();
}

/** `firstSeenAt` is the cycle's year when the item states no date. */
export function identityKey(
  orgSlug: string,
  input: Pick<OpportunityInput, "title" | "deadlineAt" | "startsAt">,
  firstSeenAt: Date,
): string {
  const cycle = new Date(input.deadlineAt ?? input.startsAt ?? firstSeenAt);
  return slugify(`${orgSlug} ${normalizeTitle(input.title)} ${cycle.getUTCFullYear()}`);
}

/** `<org-slug>-<title-slug>-<yy>`, the year of first sighting (docs/01). */
export function baseSlug(orgSlug: string, title: string, firstSeenAt: Date): string {
  const full = slugify(title);
  // Past the limit, cut back to a whole word.
  const titleSlug =
    full.length > SLUG_TITLE_MAX ? full.slice(0, SLUG_TITLE_MAX + 1).replace(/-[^-]*$/, "") : full;
  const yy = String(firstSeenAt.getUTCFullYear()).slice(-2);
  return [orgSlug, titleSlug, yy].filter(Boolean).join("-");
}
