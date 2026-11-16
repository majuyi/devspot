import type { PrismaClient } from "@devspot/db";
import type { OpportunityDto } from "@devspot/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { freshnessLine } from "../../src/ui/freshness";
import { hasDb, NOW, seedHome } from "../seed";

type Data = typeof import("../../src/data/opportunities");
type Events = typeof import("../../src/data/events");
type Status = typeof import("../../src/data/status");

describe.skipIf(!hasDb)("home queries (docs/01 §3)", () => {
  let db: PrismaClient;
  let data: Data;
  let events: Events;
  let status: Status;
  const clock = { now: NOW };
  const slugs = (items: OpportunityDto[]) => items.map((o) => o.slug);

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    data = await import("../../src/data/opportunities");
    events = await import("../../src/data/events");
    status = await import("../../src/data/status");
    await seedHome(db);
  });

  it("closing soon: every item due this week, then five later ones, soonest first", async () => {
    expect(slugs(await data.closingSoon(clock))).toEqual([
      "today",
      "tomorrow",
      "lagos-hybrid",
      "edge-week",
      "later-1",
      "later-2",
      "later-3",
      "later-4",
      "later-5",
    ]);
  });

  it("closing soon never drops an item due this week, whatever the cap on later ones", async () => {
    const list = slugs(await data.closingSoon({ ...clock, later: 0 }));
    expect(list).toEqual(["today", "tomorrow", "lagos-hybrid", "edge-week"]);
  });

  it("closing soon leaves out events, rounds, rolling, passed, closed and review items", async () => {
    const list = slugs(await data.closingSoon({ ...clock, later: 100 }));
    for (const slug of ["ev-deadline", "multi", "rolling", "passed", "closed", "in-review"]) {
      expect(list).not.toContain(slug);
    }
    expect(list).toHaveLength(11);
  });

  it("starting soon: the next four events from today, and the count /events lists", async () => {
    const soon = await events.startingSoon(clock);
    expect(slugs(soon.items)).toEqual(["ev-today", "ev-deadline", "ev-a", "ev-b"]);
    expect(soon.total).toBe(7);
    expect(soon.total).toBe((await events.listEvents({ limit: 100 }, clock)).items.length);
  });

  it("near you: the city and nationwide, never remote or another city, with the total", async () => {
    const near = await data.nearYou("lagos");
    expect(near.total).toBe(6);
    expect(near.items).toHaveLength(3);
    expect(near.items[0]?.slug).toBe("ev-deadline");
    const all = await data.nearYou("lagos", { limit: 100 });
    expect(new Set(slugs(all.items))).toEqual(
      new Set(["ev-deadline", "lagos-hybrid", "ev-ongoing", "ev-today", "lagos-job", "nation"]),
    );
    expect((await data.nearYou("kano")).total).toBe(1);
  });

  it("counts what the filters match, whatever the page", async () => {
    expect(await data.countOpportunities({ kinds: ["event"] }, clock)).toBe(7);
    expect(await data.countOpportunities({ kinds: ["event"], cursor: "ignored" }, clock)).toBe(7);
    const open = await data.countOpportunities({}, clock);
    expect(await data.countOpportunities({ status: "all" }, clock)).toBe(open + 1);
    expect(open).toBe((await data.deadlineCounts(clock)).open);
  });

  it("a list of only events is ordered by start, and pages that way", async () => {
    const order = ["ev-ongoing", "ev-today", "ev-deadline", "ev-a", "ev-b", "ev-c", "ev-d"];
    expect(slugs((await data.listOpportunities({ kinds: ["event"] }, clock)).items)).toEqual(order);
    const paged: string[] = [];
    let cursor: string | undefined;
    do {
      const p = await data.listOpportunities({ kinds: ["event"], limit: 2, cursor }, clock);
      paged.push(...slugs(p.items));
      cursor = p.nextCursor ?? undefined;
    } while (cursor);
    expect(paged).toEqual(order);
  });

  it("freshness: all enabled sources, and the hours since the one read longest ago", async () => {
    const f = await status.sourceFreshness(clock);
    expect(f).toEqual({ total: 3, read: 3, withinHours: 6 });
    expect(freshnessLine(f)).toBe("All 3 sources read in the last 6 hours.");
  });

  it("freshness: says how many when a source has not been read in a day", async () => {
    await db.source.update({ where: { key: "acme-blog" }, data: { lastOkAt: null } });
    try {
      const f = await status.sourceFreshness(clock);
      expect(f).toEqual({ total: 3, read: 2, withinHours: 24 });
      expect(freshnessLine(f)).toBe("2 of 3 sources read in the last 24 hours.");
    } finally {
      await db.source.update({
        where: { key: "acme-blog" },
        data: { lastOkAt: new Date(NOW.getTime() - 2 * 3_600_000) },
      });
    }
  });
});
