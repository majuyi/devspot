import { createHash } from "node:crypto";
import type { OpportunityStatus, Prisma, PrismaClient } from "@devspot/db";
import {
  normalizeTags,
  type OpportunityInput,
  PUBLISH_THRESHOLD,
  RULES_ONLY_PUBLISH_THRESHOLD,
} from "@devspot/schema";

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

/** docs/04 §1 stage 5. `firstSeenAt` is the cycle's year when the item states no date. */
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

/**
 * Invariant 3 (docs/03 §4). The required fields are enforced by `OpportunityInput`, so what
 * is left is confidence and, for rules alone, a stated date: rolling never publishes on rules.
 */
export function meetsPublishRule(
  input: Pick<OpportunityInput, "confidence" | "extractionMethod" | "deadlineAt" | "startsAt">,
): boolean {
  if (input.extractionMethod !== "rules") return input.confidence >= PUBLISH_THRESHOLD;
  return (
    input.confidence >= RULES_ONLY_PUBLISH_THRESHOLD && Boolean(input.deadlineAt ?? input.startsAt)
  );
}

export type LoadContext = {
  db: PrismaClient;
  orgSlug: string;
  now?: Date;
  /** When the source first listed it; `RawItem.firstSeenAt` for engine items. */
  firstSeenAt?: Date;
};

export type LoadResult = { id: string; status: OpportunityStatus; created: boolean };

const date = (iso: string | undefined) => (iso ? new Date(iso) : null);
const json = (value: unknown) => value as Prisma.InputJsonValue | undefined;

/** Stage 5 (docs/04 §1): the only writer of `Opportunity`. */
export async function load(
  input: OpportunityInput,
  { db, orgSlug, now = new Date(), firstSeenAt = now }: LoadContext,
): Promise<LoadResult> {
  const existing = await db.opportunity.findUnique({
    where: { canonicalUrl: input.canonicalUrl },
  });
  const mutable = {
    title: input.title,
    summary: input.summary ?? null,
    opensAt: date(input.opensAt),
    deadlineAt: date(input.deadlineAt),
    deadlineKind: input.deadlineKind,
    deadlineTimezone: input.deadlineTimezone ?? null,
    startsAt: date(input.startsAt),
    endsAt: date(input.endsAt),
    requirementsText: input.requirementsText ?? null,
    tags: normalizeTags(input.tags),
    extracted: json(input.extracted),
    confidence: input.confidence,
    fieldConfidence: json(input.fieldConfidence),
  };

  if (existing) {
    if (existing.reviewedAt) {
      await db.opportunity.update({
        where: { id: existing.id },
        data: { lastVerifiedAt: now },
      });
      return { id: existing.id, status: existing.status, created: false };
    }
    // Invariant 3 holds for the row's life, not only at creation: new content can raise or
    // lower it. Closed never reopens, and a duplicate waits for a reviewer.
    const movable =
      !existing.duplicateOfId && (existing.status === "review" || existing.status === "published");
    const status = movable ? (meetsPublishRule(input) ? "published" : "review") : existing.status;
    await db.opportunity.update({
      where: { id: existing.id },
      data: {
        ...mutable,
        status,
        publishedAt: status === "published" ? (existing.publishedAt ?? now) : existing.publishedAt,
        lastVerifiedAt: now,
      },
    });
    return { id: existing.id, status, created: false };
  }

  const key = identityKey(orgSlug, input, firstSeenAt);
  const original = await db.opportunity.findFirst({
    where: { identityKey: key },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const status = !original && meetsPublishRule(input) ? "published" : "review";
  const created = await db.opportunity.create({
    data: {
      ...mutable,
      slug: await uniqueSlug(db, baseSlug(orgSlug, input.title, firstSeenAt), input.canonicalUrl),
      organizationId: input.organizationId,
      ...(input.rawItemId ? { rawItemId: input.rawItemId } : {}),
      ...(input.submissionId ? { submissionId: input.submissionId } : {}),
      kind: input.kind,
      canonicalUrl: input.canonicalUrl,
      applyUrl: input.applyUrl ?? null,
      locationMode: input.locationMode,
      country: input.country ?? null,
      city: input.city ?? null,
      venueName: input.venueName ?? null,
      venueAddress: input.venueAddress ?? null,
      regionsTags: input.regionsTags,
      extractionMethod: input.extractionMethod,
      discoveredVia: input.discoveredVia,
      identityKey: key,
      status,
      ...(original ? { duplicateOfId: original.id } : {}),
      firstSeenAt,
      ...(status === "published" ? { publishedAt: now } : {}),
    },
  });
  return { id: created.id, status, created: true };
}

/** A collision takes a 4-character suffix drawn from the URL, so reruns pick the same one. */
async function uniqueSlug(db: PrismaClient, base: string, canonicalUrl: string): Promise<string> {
  for (let n = 0; ; n++) {
    const suffix = createHash("sha256").update(`${canonicalUrl}#${n}`).digest("hex").slice(0, 4);
    const slug = n === 0 ? base : `${base}-${suffix}`;
    const taken = await db.opportunity.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
}
