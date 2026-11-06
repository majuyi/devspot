import { db, type Prisma } from "@devspot/db";
import type { OpportunityDto, Preferences } from "@devspot/schema";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "./cursor";
import { OPEN, type OpportunityRow, toOpportunityDto, withOrganization } from "./dto";
import { type Keyset, keyOf, keysetAfter, keysetOrder } from "./keyset";
import { availableIn } from "./location";
import type { Page } from "./opportunities";
import { addMs, DAY } from "./time";

const SOON: Keyset = { field: "deadlineAt", dir: "asc", nullable: false };
const REST: Keyset = { field: "publishedAt", dir: "desc", nullable: true };

/** Which part of the feed the cursor is in, and the last row there (none: the part's start). */
const FeedCursor = z.object({
  p: z.enum(["soon", "rest"]),
  k: z.iso.datetime().nullable().optional(),
  id: z.string().min(1).optional(),
});
type FeedCursor = z.infer<typeof FeedCursor>;

function preferenceWhere(p: Preferences): Prisma.OpportunityWhereInput[] {
  const and: Prisma.OpportunityWhereInput[] = [OPEN];
  if (p.kinds.length) and.push({ kind: { in: p.kinds } });
  if (p.tags.length) and.push({ tags: { hasSome: p.tags } });
  if (p.remoteOnly) and.push({ locationMode: "remote" });
  else if (p.city) and.push(availableIn(p.city));
  // With no city chosen, every Nigerian city counts as near.
  else and.push({ OR: [{ locationMode: "remote" }, { country: "NG" }] });
  return and;
}

const after = (ks: Keyset, c: FeedCursor | undefined) =>
  c?.id === undefined ? {} : keysetAfter(ks, { k: c.k ?? null, id: c.id });

/**
 * `/feed` per docs/01 §2: deadlines in the next 14 days first, soonest first; then everything
 * else, newest first. The cursor says which of the two parts it is in.
 */
export async function feed(
  prefs: Preferences,
  { now = new Date(), limit = 30, cursor }: { now?: Date; limit?: number; cursor?: string } = {},
): Promise<Page<OpportunityDto>> {
  const c = decodeCursor(cursor, FeedCursor);
  const base = preferenceWhere(prefs);
  const window = { gte: now, lte: addMs(now, 14 * DAY) };
  const query = (
    ks: Keyset,
    part: Prisma.OpportunityWhereInput,
    at: FeedCursor | undefined,
    take: number,
  ) =>
    db.opportunity.findMany({
      where: { AND: [...base, part, after(ks, at)] },
      orderBy: keysetOrder(ks),
      include: withOrganization,
      take,
    });
  const next = (p: FeedCursor["p"], ks: Keyset, r?: OpportunityRow) =>
    encodeCursor(r ? { p, ...keyOf(ks, r) } : { p });

  const soon = c?.p === "rest" ? [] : await query(SOON, { deadlineAt: window }, c, limit + 1);
  if (soon.length > limit) {
    const items = soon.slice(0, limit);
    return { items: items.map(toOpportunityDto), nextCursor: next("soon", SOON, items.at(-1)) };
  }
  const need = limit - soon.length;
  // Spelled out because NOT (deadlineAt in window) is NULL in SQL for an undated row.
  const restPart = {
    OR: [
      { deadlineAt: null },
      { deadlineAt: { lt: window.gte } },
      { deadlineAt: { gt: window.lte } },
    ],
  };
  const rest = await query(REST, restPart, c?.p === "rest" ? c : undefined, need + 1);
  const items = [...soon, ...rest.slice(0, need)];
  let nextCursor: string | null = null;
  if (rest.length > need)
    nextCursor = need === 0 ? next("rest", REST) : next("rest", REST, rest[need - 1]);
  return { items: items.map(toOpportunityDto), nextCursor };
}
