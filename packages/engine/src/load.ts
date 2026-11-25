import { type OpportunityStatus, type Prisma, type PrismaClient, uniqueSlug } from "@devspot/db";
import { baseSlug, identityKey, normalizeTags, type OpportunityInput } from "@devspot/schema";
import { isOver } from "./over.js";
import { meetsPublishRule } from "./publish-rule.js";
import type { VerifyResult } from "./verify.js";

// Shared with /admin/new, which must compute the same keys (docs/04 §1 stage 5).
export { baseSlug, identityKey, normalizeTitle, slugify } from "@devspot/schema";

// The publish rule has its own file so the eval can apply it without the database client.
export { meetsPublishRule, TEST_TITLE } from "./publish-rule.js";

export type LoadContext = {
  db: PrismaClient;
  orgSlug: string;
  now?: Date;
  /** When the source first listed it; `RawItem.firstSeenAt` for engine items. */
  firstSeenAt?: Date;
};

export type LoadResult = { id: string; status: OpportunityStatus; created: boolean };

const date = (value: string | undefined) => (value ? new Date(value) : null);
const iso = (d: Date | null) => d?.toISOString() ?? null;
const changes = (value: Record<string, { from: string | null; to: string | null }>) =>
  value as Prisma.InputJsonObject;
const sameInstant = (a: Date | null, b: Date | null) =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);
const json = (value: unknown) => value as Prisma.InputJsonValue | undefined;

type Placed = { status: OpportunityStatus; duplicateOfId: string | null };

/** An unreviewed row new content may move: not closed, rejected or waiting as a copy. */
export const isMovable = (row: Placed) =>
  !row.duplicateOfId && (row.status === "review" || row.status === "published");

/**
 * The status the loader gives a row (invariants 3 and 7), shared with `engine reextract
 * --dry-run` so the preview cannot drift from the write. A new item that repeats an earlier
 * one's identity key (`isCopy`) waits for review.
 */
export function statusFor(
  existing: Placed | null,
  input: OpportunityInput,
  over: boolean,
  isCopy: boolean,
): OpportunityStatus {
  if (existing && !isMovable(existing)) return existing.status;
  if (over) return "closed";
  return !isCopy && meetsPublishRule(input) ? "published" : "review";
}

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
  // A listing already past its date is closed on the way in (invariant 7), never published.
  const over = isOver(mutable, now);
  const closing = { statusReason: "date-passed", closedAt: now };

  if (existing) {
    const stated = mutable.deadlineAt;
    if (existing.reviewedAt) {
      // A maintainer's version wins. When the source states a different deadline, keep the
      // row and note the source's date for review; when the source agrees again, drop it.
      // A page that states no deadline at all is not taken as a change: it may be a misread.
      const disagrees = stated !== null && !sameInstant(existing.deadlineAt, stated);
      const newlyDisagrees = disagrees && !sameInstant(existing.sourceDeadlineAt, stated);
      const update = db.opportunity.update({
        where: { id: existing.id },
        data: {
          lastVerifiedAt: now,
          ...(newlyDisagrees ? { sourceDeadlineAt: stated } : {}),
          ...(!disagrees && existing.sourceDeadlineAt ? { sourceDeadlineAt: null } : {}),
        },
      });
      if (newlyDisagrees) {
        await db.$transaction([
          update,
          db.opportunityEvent.create({
            data: {
              opportunityId: existing.id,
              actor: "engine",
              action: "deadlineChanged",
              changes: changes({
                sourceDeadlineAt: { from: iso(existing.sourceDeadlineAt), to: iso(stated) },
              }),
              note: "The source page now states a different deadline. The reviewed one is kept until a maintainer looks.",
            },
          }),
        ]);
      } else {
        await update;
      }
      return { id: existing.id, status: existing.status, created: false };
    }
    // Invariant 3 holds for the row's life, not only at creation: new content can raise or
    // lower it. Closed never reopens, and a duplicate waits for a reviewer.
    const movable = isMovable(existing);
    const status = statusFor(existing, input, over, false);
    // Stage 5 records a stated deadline that changed: the history row always, and the
    // "moved" columns the public pages read when a date became another date.
    const deadlineChanged =
      !sameInstant(existing.deadlineAt, stated) || existing.deadlineKind !== mutable.deadlineKind;
    const moved =
      existing.deadlineAt !== null && stated !== null && !sameInstant(existing.deadlineAt, stated);
    const update = db.opportunity.update({
      where: { id: existing.id },
      data: {
        ...mutable,
        status,
        publishedAt: status === "published" ? (existing.publishedAt ?? now) : existing.publishedAt,
        ...(movable && status === "closed" ? closing : {}),
        lastVerifiedAt: now,
        ...(moved ? { previousDeadlineAt: existing.deadlineAt, deadlineChangedAt: now } : {}),
      },
    });
    if (deadlineChanged) {
      await db.$transaction([
        update,
        db.opportunityEvent.create({
          data: {
            opportunityId: existing.id,
            actor: "engine",
            action: "deadlineChanged",
            changes: changes({
              deadlineAt: { from: iso(existing.deadlineAt), to: iso(stated) },
              ...(existing.deadlineKind !== mutable.deadlineKind
                ? { deadlineKind: { from: existing.deadlineKind, to: mutable.deadlineKind } }
                : {}),
            }),
          },
        }),
      ]);
    } else {
      await update;
    }
    return { id: existing.id, status, created: false };
  }

  const key = identityKey(orgSlug, input, firstSeenAt);
  const original = await db.opportunity.findFirst({
    where: { identityKey: key },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const status = statusFor(null, input, over, Boolean(original));
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
      ...(status === "closed" ? closing : {}),
    },
  });
  return { id: created.id, status, created: true };
}

/** Why the engine closed a row whose source no longer lists it. */
export const REMOVED_FROM_LISTING = "removed-from-listing";

/**
 * After a complete read of a careers board (docs/04 §1): an open row from the source whose
 * URL the board no longer lists closes, and a row closed that way whose URL is listed again
 * goes back to the status it had. This is the one way a closed row reopens: the role was
 * not over, the board had dropped it for a while. Both are recorded in the history.
 */
export async function closeRemoved(
  db: PrismaClient,
  sourceId: string,
  listed: readonly string[],
  now: Date = new Date(),
): Promise<{ closed: number; reopened: number }> {
  const fromSource = { rawItem: { sourceId } };
  const gone = await db.opportunity.findMany({
    where: {
      ...fromSource,
      status: { in: ["published", "review"] },
      canonicalUrl: { notIn: [...listed] },
    },
    select: { id: true, status: true },
  });
  for (const row of gone) {
    await db.$transaction([
      db.opportunity.update({
        where: { id: row.id },
        data: { status: "closed", statusReason: REMOVED_FROM_LISTING, closedAt: now },
      }),
      db.opportunityEvent.create({
        data: {
          opportunityId: row.id,
          actor: "engine",
          action: "closed",
          changes: changes({ status: { from: row.status, to: "closed" } }),
          note: "No longer on the organisation's own listing.",
        },
      }),
    ]);
  }
  const back = await db.opportunity.findMany({
    where: {
      ...fromSource,
      status: "closed",
      statusReason: REMOVED_FROM_LISTING,
      canonicalUrl: { in: [...listed] },
    },
    select: {
      id: true,
      publishedAt: true,
      events: { where: { action: "closed" }, orderBy: { at: "desc" }, take: 1 },
    },
  });
  for (const row of back) {
    const was = (row.events[0]?.changes as { status?: { from?: string } } | null)?.status?.from;
    const status = was === "published" ? "published" : "review";
    await db.$transaction([
      db.opportunity.update({
        where: { id: row.id },
        data: {
          status,
          statusReason: null,
          closedAt: null,
          ...(status === "published" ? { publishedAt: row.publishedAt ?? now } : {}),
        },
      }),
      db.opportunityEvent.create({
        data: {
          opportunityId: row.id,
          actor: "engine",
          action: status === "published" ? "published" : "edited",
          changes: changes({ status: { from: "closed", to: status } }),
          note: "Listed again on the organisation's own listing.",
        },
      }),
    ]);
  }
  return { closed: gone.length, reopened: back.length };
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
