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
import { addMs, DAY, HOUR } from "./time";

export type Page<T> = { items: T[]; nextCursor: string | null };

/** The filters of `GET /api/v1/opportunities` (docs/06 §3), shared with `/opportunities`. */
export type OpportunityFilters = Omit<ApiListParams, "status" | "sort" | "limit"> &
  Partial<Pick<ApiListParams, "status" | "sort" | "limit">>;

const SORTS = {
  deadline: { field: "deadlineAt", dir: "asc", nullable: true },
  new: { field: "publishedAt", dir: "desc", nullable: true },
  updated: { field: "updatedAt", dir: "desc", nullable: false },
} as const satisfies Record<ApiListParams["sort"], Keyset>;

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
  const ks = SORTS[f.sort ?? "deadline"];
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

/** Home, "Closing this week": deadlines from now to `days` ahead, soonest first. */
export async function closingSoon({ now = new Date(), days = 7, limit = 8 } = {}) {
  const rows = await db.opportunity.findMany({
    where: { ...OPEN, deadlineAt: { gte: now, lte: addMs(now, days * DAY) } },
    orderBy: [{ deadlineAt: "asc" }, { id: "asc" }],
    include: withOrganization,
    take: limit,
  });
  return rows.map(toOpportunityDto);
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

/** Home, "Near you": events and on-site roles in the city, soonest deadline first. */
export async function nearYou(city: CitySlug, { limit = 6 } = {}) {
  const rows = await db.opportunity.findMany({
    where: { ...OPEN, city, locationMode: { in: ["onsite", "hybrid"] } },
    orderBy: [
      { deadlineAt: { sort: "asc", nulls: "last" } },
      { startsAt: { sort: "asc", nulls: "last" } },
      { id: "asc" },
    ],
    include: withOrganization,
    take: limit,
  });
  return rows.map(toOpportunityDto);
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
