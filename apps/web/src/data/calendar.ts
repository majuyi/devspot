import { db, type Prisma } from "@devspot/db";
import type { CitySlug, OpportunityDto, OpportunityKind } from "@devspot/schema";
import { OPEN, toOpportunityDto, withOrganization } from "./dto";
import { availableIn } from "./location";

export type CalendarFilters = {
  /** The instants a date must fall between: `from` included, `to` not. */
  from: Date;
  to: Date;
  kinds?: OpportunityKind[];
  city?: CitySlug;
  tags?: string[];
  limit?: number;
};

/**
 * `/calendar` and `/calendar.ics` (docs/01 §3): open items with a date to put on a calendar.
 * A non-event counts by its stated deadline, an event by its start; rolling and undated
 * items have no day to sit on and are left out. Ordered by that date.
 */
export async function calendarItems(f: CalendarFilters): Promise<OpportunityDto[]> {
  const window = { gte: f.from, lt: f.to };
  const and: Prisma.OpportunityWhereInput[] = [
    OPEN,
    {
      OR: [
        {
          kind: { not: "event" },
          deadlineKind: { in: ["fixed", "multiRound"] },
          deadlineAt: window,
        },
        { kind: "event", startsAt: window },
      ],
    },
  ];
  if (f.kinds?.length) and.push({ kind: { in: f.kinds } });
  if (f.city) and.push(availableIn(f.city));
  if (f.tags?.length) and.push({ tags: { hasSome: f.tags } });
  const rows = await db.opportunity.findMany({
    where: { AND: and },
    include: withOrganization,
    // Two columns decide the date, so the order is settled below, not in SQL. The cap is on
    // the soonest by either column, which a month or a feed stays far under.
    orderBy: [{ deadlineAt: { sort: "asc", nulls: "last" } }, { id: "asc" }],
    take: f.limit ?? 1000,
  });
  const at = (r: (typeof rows)[number]) =>
    (r.kind === "event" ? r.startsAt : r.deadlineAt)?.getTime() ?? 0;
  return rows.sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id)).map(toOpportunityDto);
}
