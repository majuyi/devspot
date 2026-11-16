import { db, type Prisma } from "@devspot/db";
import {
  type ApiListParams,
  type CitySlug,
  type OpportunityDto,
  OpportunityKind,
} from "@devspot/schema";
import { decodeCursor, encodeCursor, KeyCursor } from "./cursor";
import { OPEN, type OpportunityRow, PUBLIC, toOpportunityDto, withOrganization } from "./dto";
import { type Keyset, keyOf, keysetAfter, keysetOrder } from "./keyset";
import { availableIn } from "./location";
import { addMs, DAY, HOUR, startOfDayWat } from "./time";

export type Page<T> = { items: T[]; nextCursor: string | null };

/** The filters of `GET /api/v1/opportunities` (docs/06 §3), shared with `/opportunities`. */
export type OpportunityFilters = Omit<ApiListParams, "status" | "sort" | "limit"> &
  Partial<Pick<ApiListParams, "status" | "sort" | "limit">>;

const SORTS = {
  deadline: { field: "deadlineAt", dir: "asc", nullable: true },
  new: { field: "publishedAt", dir: "desc", nullable: true },
  updated: { field: "updatedAt", dir: "desc", nullable: false },
} as const satisfies Record<ApiListParams["sort"], Keyset>;

/** Events have no deadline to sort by; a list of only events orders by start instead. */
const BY_START: Keyset = { field: "startsAt", dir: "asc", nullable: true };

function keysetFor(f: OpportunityFilters): Keyset {
  const sort = f.sort ?? "deadline";
  const eventsOnly = Boolean(f.kinds?.length) && f.kinds?.every((k) => k === "event");
  return sort === "deadline" && eventsOnly ? BY_START : SORTS[sort];
}

type Clock = { now?: Date };

/** Full-text search per docs/01 §3. No index yet: docs/03 §5 adds one when it is slow. */
async function searchIds(q: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM opportunities
    WHERE status IN ('published', 'closed')
      AND to_tsvector('english', title || ' ' || coalesce(summary, ''))
          @@ plainto_tsquery('english', ${q})`;
  return rows.map((r) => r.id);
}

async function filterWhere(
  f: OpportunityFilters,
  now: Date,
): Promise<Prisma.OpportunityWhereInput[]> {
  const status = f.status ?? "published";
  const and: Prisma.OpportunityWhereInput[] = [status === "all" ? PUBLIC : { ...PUBLIC, status }];
  if (f.kinds?.length) and.push({ kind: { in: f.kinds } });
  if (f.city) and.push(availableIn(f.city));
  if (f.country) and.push({ country: f.country.toUpperCase() });
  if (f.remote) and.push({ locationMode: "remote" });
  if (f.tags?.length) and.push({ tags: { hasSome: f.tags } });
  if (f.org) and.push({ organization: { slug: f.org } });
  if (f.closingWithin) {
    and.push({ deadlineAt: { gte: now, lte: addMs(now, f.closingWithin * DAY) } });
  }
  if (f.updatedSince) and.push({ updatedAt: { gte: new Date(f.updatedSince) } });
  const q = f.q?.trim();
  if (q) and.push({ id: { in: await searchIds(q) } });
  return and;
}

/** One page of opportunities, keyset-paginated on the chosen sort. */
export async function listOpportunities(
  f: OpportunityFilters,
  { now = new Date() }: Clock = {},
): Promise<Page<OpportunityDto>> {
  const ks = keysetFor(f);
  const limit = f.limit ?? 30;
  const after = decodeCursor(f.cursor, KeyCursor);
  const rows = await db.opportunity.findMany({
    where: { AND: [...(await filterWhere(f, now)), keysetAfter(ks, after)] },
    orderBy: keysetOrder(ks),
    include: withOrganization,
    take: limit + 1,
  });
  return page(rows, limit, (r) => keyOf(ks, r));
}

/** How many rows the filters match in all, for "Showing 30 of 120". The cursor plays no part. */
export async function countOpportunities(
  f: OpportunityFilters,
  { now = new Date() }: Clock = {},
): Promise<number> {
  return db.opportunity.count({ where: { AND: await filterWhere(f, now) } });
}

export function page(
  rows: OpportunityRow[],
  limit: number,
  key: (r: OpportunityRow) => unknown,
): Page<OpportunityDto> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(toOpportunityDto),
    nextCursor: rows.length > limit && last ? encodeCursor(key(last)) : null,
  };
}

/** A published or closed opportunity; anything else does not exist to the public. */
export async function getOpportunity(slug: string): Promise<OpportunityDto | null> {
  const row = await db.opportunity.findFirst({
    where: { ...PUBLIC, slug },
    include: withOrganization,
  });
  return row ? toOpportunityDto(row) : null;
}

/**
 * Home, "Closing soon" (docs/01 §3): non-event items with a fixed deadline still ahead,
 * soonest first. Everything due within the Today, Tomorrow and This week groups is returned,
 * however many: hiding one would break the promise. Only the Later group is capped.
 */
export async function closingSoon({ now = new Date(), later = 5 } = {}) {
  const dated: Prisma.OpportunityWhereInput = {
    AND: [OPEN, { kind: { not: "event" } }],
    deadlineKind: "fixed",
  };
  // "This week" runs to the end of the seventh day after today in Lagos (ui/urgency groupOf).
  const laterFrom = addMs(startOfDayWat(now), 8 * DAY);
  const query = (deadlineAt: Prisma.DateTimeNullableFilter, take?: number) =>
    db.opportunity.findMany({
      where: { ...dated, deadlineAt },
      orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
      include: withOrganization,
      take,
    });
  const [soon, rest] = await Promise.all([
    query({ gte: now, lt: laterFrom }),
    query({ gte: laterFrom }, later),
  ]);
  return [...soon, ...rest].map(toOpportunityDto);
}

/** Home, "New this week": published in the last 7 days, newest first. */
export async function newThisWeek({ now = new Date(), limit = 9 } = {}) {
  const rows = await db.opportunity.findMany({
    where: { ...OPEN, publishedAt: { gte: addMs(now, -7 * DAY) } },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    include: withOrganization,
    take: limit,
  });
  return rows.map(toOpportunityDto);
}

/**
 * Home, "Near you": what is in the city or open across Nigeria, soonest deadline first, and
 * how many there are in all. Remote items are left out; every reader sees those already.
 */
export async function nearYou(city: CitySlug, { limit = 3 } = {}) {
  const where: Prisma.OpportunityWhereInput = {
    ...OPEN,
    locationMode: { in: ["onsite", "hybrid"] },
    country: "NG",
    OR: [{ city }, { city: null }],
  };
  const [rows, total] = await Promise.all([
    db.opportunity.findMany({
      where,
      orderBy: [
        { deadlineAt: { sort: "asc", nulls: "last" } },
        { startsAt: { sort: "asc", nulls: "last" } },
        { id: "asc" },
      ],
      include: withOrganization,
      take: limit,
    }),
    db.opportunity.count({ where }),
  ]);
  return { items: rows.map(toOpportunityDto), total };
}

/**
 * The status row: open items, and how many close within 7 days and within 48 hours. A
 * deadline already passed but not yet closed by verify counts as open, not as closing.
 */
export async function deadlineCounts({ now = new Date() } = {}) {
  const closing = (ms: number) =>
    db.opportunity.count({ where: { ...OPEN, deadlineAt: { gte: now, lte: addMs(now, ms) } } });
  const [open, within7Days, within48Hours] = await Promise.all([
    db.opportunity.count({ where: OPEN }),
    closing(7 * DAY),
    closing(48 * HOUR),
  ]);
  return { open, within7Days, within48Hours };
}

/** Kind tiles: open count per kind, zero included. */
export async function openCountsByKind(): Promise<Record<OpportunityKind, number>> {
  const groups = await db.opportunity.groupBy({ by: ["kind"], where: OPEN, _count: true });
  const counts = Object.fromEntries(OpportunityKind.options.map((k) => [k, 0])) as Record<
    OpportunityKind,
    number
  >;
  for (const g of groups) if (g.kind) counts[g.kind] = g._count;
  return counts;
}

/** The map: open on-site and hybrid items per city, most first, and the remote count. */
export async function openCountsByCity() {
  const [groups, remote] = await Promise.all([
    db.opportunity.groupBy({
      by: ["city"],
      where: { ...OPEN, city: { not: null }, locationMode: { in: ["onsite", "hybrid"] } },
      _count: true,
    }),
    db.opportunity.count({ where: { ...OPEN, locationMode: "remote" } }),
  ]);
  const cities = groups
    .flatMap((g) => (g.city ? [{ city: g.city, count: g._count }] : []))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  return { cities, remote };
}

export type OpenPlace = {
  count: number;
  /** The soonest stated deadline still ahead among non-events there. */
  nextDeadlineAt: string | null;
  /** The soonest event start from today (in Lagos) there. */
  nextStartsAt: string | null;
};

/**
 * The home band (docs/01 §3): for Remote and for each city with open items, how many are
 * open and the two instants its urgency colour is read from. Cities count on-site and hybrid
 * items, as the map does; most items first.
 */
export async function openPlaces({ now = new Date() } = {}) {
  const inCity: Prisma.OpportunityWhereInput = {
    ...OPEN,
    city: { not: null },
    locationMode: { in: ["onsite", "hybrid"] },
  };
  const remote: Prisma.OpportunityWhereInput = { ...OPEN, locationMode: "remote" };
  // What a row counts down to (ui/urgency `target`): a stated deadline, or an event's start.
  const deadline: Prisma.OpportunityWhereInput = {
    AND: [{ kind: { not: "event" } }],
    deadlineKind: { in: ["fixed", "multiRound"] },
    deadlineAt: { gte: now },
  };
  const start: Prisma.OpportunityWhereInput = {
    AND: [{ kind: "event" }],
    startsAt: { gte: startOfDayWat(now) },
  };
  const [counts, deadlines, starts, remoteCount, remoteDeadline, remoteStart] = await Promise.all([
    db.opportunity.groupBy({ by: ["city"], where: inCity, _count: true }),
    db.opportunity.groupBy({
      by: ["city"],
      where: { ...inCity, ...deadline },
      _min: { deadlineAt: true },
    }),
    db.opportunity.groupBy({
      by: ["city"],
      where: { ...inCity, ...start },
      _min: { startsAt: true },
    }),
    db.opportunity.count({ where: remote }),
    db.opportunity.aggregate({ where: { ...remote, ...deadline }, _min: { deadlineAt: true } }),
    db.opportunity.aggregate({ where: { ...remote, ...start }, _min: { startsAt: true } }),
  ]);
  const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
  const cities = counts
    .flatMap((g) =>
      g.city
        ? [
            {
              city: g.city,
              count: g._count,
              nextDeadlineAt: iso(deadlines.find((d) => d.city === g.city)?._min.deadlineAt),
              nextStartsAt: iso(starts.find((d) => d.city === g.city)?._min.startsAt),
            },
          ]
        : [],
    )
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
  return {
    remote: {
      count: remoteCount,
      nextDeadlineAt: iso(remoteDeadline._min.deadlineAt),
      nextStartsAt: iso(remoteStart._min.startsAt),
    } satisfies OpenPlace,
    cities: cities satisfies (OpenPlace & { city: string })[],
  };
}

/** Opportunity page, "Related": the organization's other open items, then the kind in the city. */
export async function related(o: OpportunityDto, { limit = 4 } = {}) {
  const order = [{ deadlineAt: { sort: "asc", nulls: "last" } }, { id: "asc" }] as const;
  const sameOrg = await db.opportunity.findMany({
    where: { ...OPEN, organization: { slug: o.organization.slug }, id: { not: o.id } },
    orderBy: [...order],
    include: withOrganization,
    take: limit,
  });
  const sameKind = await db.opportunity.findMany({
    where: {
      ...OPEN,
      kind: o.kind,
      city: o.city,
      id: { notIn: [o.id, ...sameOrg.map((r) => r.id)] },
    },
    orderBy: [...order],
    include: withOrganization,
    take: limit,
  });
  return {
    sameOrganization: sameOrg.map(toOpportunityDto),
    sameKind: sameKind.map(toOpportunityDto),
  };
}
