import { type OpportunityStatus, type Prisma, type PrismaClient, uniqueSlug } from "@devspot/db";
import {
  baseSlug,
  identityKey,
  normalizeTags,
  type OpportunityInput,
  PUBLISH_THRESHOLD,
  RULES_ONLY_PUBLISH_THRESHOLD,
} from "@devspot/schema";
import type { VerifyResult } from "./verify.js";

// Shared with /admin/new, which must compute the same keys (docs/04 §1 stage 5).
export { baseSlug, identityKey, normalizeTitle, slugify } from "@devspot/schema";

/**
 * A listing its own title calls a test ("Test Hackathon - Didit KYC", "Event (test)"). Some
 * also catch real roles ("Test Automation Engineer"); those only wait for review.
 */
export const TEST_TITLE =
  /^\W*(?:test|dummy)\b|\b(?:test|dummy) (?:hackathon|event|listing|challenge|competition|post|page|opportunity)\b|[([](?:test|dummy)[)\]]/i;

/**
 * Invariant 3 (docs/03 §4). Kind and location mode must be known, and an engine item whose
 * title marks it as a test waits for review. Then it is confidence and, for rules alone, a
 * stated date: rolling never publishes on rules.
 */
export function meetsPublishRule(
  input: Pick<
    OpportunityInput,
    | "title"
    | "kind"
    | "locationMode"
    | "confidence"
    | "extractionMethod"
    | "deadlineAt"
    | "startsAt"
  >,
): boolean {
  if (!input.kind || !input.locationMode) return false;
  // A maintainer entering a row by hand means it, whatever the title says.
  if (input.extractionMethod !== "manual" && TEST_TITLE.test(input.title)) return false;
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
    kind: input.kind ?? null,
    summary: input.summary ?? null,
    opensAt: date(input.opensAt),
    deadlineAt: date(input.deadlineAt),
    deadlineKind: input.deadlineKind,
    deadlineTimezone: input.deadlineTimezone ?? null,
    startsAt: date(input.startsAt),
    endsAt: date(input.endsAt),
    locationMode: input.locationMode ?? null,
    country: input.country ?? null,
    city: input.city ?? null,
    venueName: input.venueName ?? null,
    venueAddress: input.venueAddress ?? null,
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
      canonicalUrl: input.canonicalUrl,
      applyUrl: input.applyUrl ?? null,
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

/** Stage 6's writes, here so the loader stays the only writer of `Opportunity`. */
export async function applyVerification(
  db: PrismaClient,
  id: string,
  result: VerifyResult,
  now: Date,
): Promise<void> {
  if (result.outcome === "unreachable") return;
  // updateMany: a row a reviewer changed or removed mid-pass is skipped, not an error.
  await db.opportunity.updateMany({
    where: { id, status: "published" },
    data:
      result.outcome === "closed"
        ? { status: "closed", statusReason: result.reason, closedAt: now, lastVerifiedAt: now }
        : { lastVerifiedAt: now },
  });
}
