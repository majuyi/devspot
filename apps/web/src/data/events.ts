import { db, type Prisma } from "@devspot/db";
import type { CitySlug, OpportunityDto } from "@devspot/schema";
import { decodeCursor, KeyCursor } from "./cursor";
import { OPEN, withOrganization } from "./dto";
import { type Keyset, keyOf, keysetAfter, keysetOrder } from "./keyset";
import { availableIn } from "./location";
import { type Page, page } from "./opportunities";
import { startOfDayWat } from "./time";

export type EventFilters = {
  city?: CitySlug;
  /** ISO date or datetime; defaults to the start of today in Lagos. */
  from?: string;
  to?: string;
  tags?: string[];
  limit?: number;
  cursor?: string;
};

const BY_START: Keyset = { field: "startsAt", dir: "asc", nullable: false };

/**
 * `/events` and `GET /api/v1/events`: upcoming events by start. An event already under way
 * (started before `from`, ending after it) is still upcoming.
 */
export async function listEvents(
  f: EventFilters = {},
  { now = new Date() } = {},
): Promise<Page<OpportunityDto>> {
  const from = f.from ? new Date(f.from) : startOfDayWat(now);
  const limit = f.limit ?? 30;
  const and: Prisma.OpportunityWhereInput[] = [
    { ...OPEN, kind: "event", startsAt: { not: null } },
    { OR: [{ startsAt: { gte: from } }, { endsAt: { gte: from } }] },
    keysetAfter(BY_START, decodeCursor(f.cursor, KeyCursor)),
  ];
  if (f.to) and.push({ startsAt: { lte: new Date(f.to) } });
  if (f.city) and.push(availableIn(f.city));
  if (f.tags?.length) and.push({ tags: { hasSome: f.tags } });
  const rows = await db.opportunity.findMany({
    where: { AND: and },
    orderBy: keysetOrder(BY_START),
    include: withOrganization,
    take: limit + 1,
  });
  return page(rows, limit, (r) => keyOf(BY_START, r));
}
