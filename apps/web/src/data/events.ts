import { db, type Prisma } from "@devspot/db";
import type { CitySlug, OpportunityDto } from "@devspot/schema";
import { decodeCursor, KeyCursor } from "./cursor";
import { OPEN, toOpportunityDto, withOrganization } from "./dto";
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

/** Upcoming events: started on or after `from`, or still running then. */
function upcoming(f: EventFilters, now: Date): Prisma.OpportunityWhereInput[] {
  const from = f.from ? new Date(f.from) : startOfDayWat(now);
  const and: Prisma.OpportunityWhereInput[] = [
    { ...OPEN, kind: "event", startsAt: { not: null } },
    { OR: [{ startsAt: { gte: from } }, { endsAt: { gte: from } }] },
  ];
  if (f.to) and.push({ startsAt: { lte: new Date(f.to) } });
  if (f.city) and.push(availableIn(f.city));
  if (f.tags?.length) and.push({ tags: { hasSome: f.tags } });
  return and;
}

/**
 * `/events` and `GET /api/v1/events`: upcoming events by start. An event already under way
 * (started before `from`, ending after it) is still upcoming.
 */
export async function listEvents(
  f: EventFilters = {},
  { now = new Date() } = {},
): Promise<Page<OpportunityDto>> {
  const limit = f.limit ?? 30;
  const rows = await db.opportunity.findMany({
    where: { AND: [...upcoming(f, now), keysetAfter(BY_START, decodeCursor(f.cursor, KeyCursor))] },
    orderBy: keysetOrder(BY_START),
    include: withOrganization,
    take: limit + 1,
  });
  return page(rows, limit, (r) => keyOf(BY_START, r));
}

/** How many events the filters match in all, whatever the page. */
export async function countEvents(f: EventFilters = {}, { now = new Date() } = {}) {
  return db.opportunity.count({ where: { AND: upcoming(f, now) } });
}

/** The place pills on `/events`: upcoming on-site and hybrid events per city, most first. */
export async function eventCountsByCity({ now = new Date() } = {}) {
  const groups = await db.opportunity.groupBy({
    by: ["city"],
    where: {
      AND: [
        ...upcoming({}, now),
        { city: { not: null }, locationMode: { in: ["onsite", "hybrid"] } },
      ],
    },
    _count: true,
  });
  return groups
    .flatMap((g) => (g.city ? [{ city: g.city, count: g._count }] : []))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/**
 * Home, "Starting soon": the next events by start, from today in Lagos, and how many are
 * upcoming in all (the same set `/events` lists, which also keeps events under way). Ids in
 * `exclude`, already shown higher on the page, are skipped but still counted.
 */
export async function startingSoon({ now = new Date(), limit = 4, exclude = [] as string[] } = {}) {
  const from = startOfDayWat(now);
  const event: Prisma.OpportunityWhereInput = { ...OPEN, kind: "event", startsAt: { not: null } };
  const [rows, total] = await Promise.all([
    db.opportunity.findMany({
      where: {
        ...event,
        startsAt: { gte: from },
        ...(exclude.length ? { id: { notIn: exclude } } : {}),
      },
      orderBy: keysetOrder(BY_START),
      include: withOrganization,
      take: limit,
    }),
    db.opportunity.count({
      where: { AND: [event, { OR: [{ startsAt: { gte: from } }, { endsAt: { gte: from } }] }] },
    }),
  ]);
  return { items: rows.map(toOpportunityDto), total };
}
