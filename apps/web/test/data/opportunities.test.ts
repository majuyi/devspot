import type { PrismaClient } from "@devspot/db";
import { OpportunityDto, type Preferences } from "@devspot/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { InvalidCursor } from "../../src/data/cursor";
import type { Page } from "../../src/data/opportunities";
import { at, hasDb, NOW, opp, org, reset } from "../seed";

type Data = typeof import("../../src/data/opportunities");
type Events = typeof import("../../src/data/events");
type Feed = typeof import("../../src/data/feed");

describe.skipIf(!hasDb)("opportunity queries", () => {
  let db: PrismaClient;
  let data: Data;
  let events: Events;
  let feedData: Feed;

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    data = await import("../../src/data/opportunities");
    events = await import("../../src/data/events");
    feedData = await import("../../src/data/feed");
    await reset(db);
    const devpost = await org(db, { slug: "devpost", category: "hackathonHost", country: "US" });
    const gdg = await org(db, { slug: "gdg-ibadan", category: "community", city: "ibadan" });
    const kuda = await org(db, { slug: "kuda", city: "lagos" });
    const remote = { organizationId: devpost.id };
    const ibadan = {
      organizationId: gdg.id,
      kind: "event",
      locationMode: "onsite",
      country: "NG",
      city: "ibadan",
    } as const;
    for (const o of [
      {
        slug: "girls-who-code",
        title: "Girls Who Code HHS Hackathon",
        deadlineAt: at(16),
        publishedAt: at(-48),
        tags: ["women-in-tech"],
      },
      {
        slug: "next-byte",
        title: "Next Byte Hacks V5",
        deadlineAt: at(72),
        publishedAt: at(-240),
        tags: ["ml"],
      },
      {
        slug: "paypal",
        title: "PayPal AI Hackathon",
        summary: "Build payments with AI.",
        deadlineAt: at(192),
        publishedAt: at(-24),
      },
      {
        slug: "passed",
        title: "Deadline passed, not yet verified",
        deadlineAt: at(-5),
        publishedAt: at(-300),
      },
      {
        slug: "closed",
        title: "Old Hackathon",
        status: "closed",
        deadlineAt: at(-120),
        closedAt: at(-90),
      },
      { slug: "in-review", title: "Secret review item", status: "review" },
      { slug: "no-kind", title: "Published without a kind", kind: null },
      {
        slug: "online-meetup",
        title: "Online meetup",
        kind: "event",
        startsAt: at(120),
        publishedAt: at(-30),
      },
    ] as const) {
      await opp(db, { ...remote, ...o, tags: "tags" in o && o.tags ? [...o.tags] : [] });
    }
    await opp(db, {
      ...ibadan,
      slug: "devfest-ibadan",
      title: "Road to DevFest Ibadan",
      startsAt: at(72),
      publishedAt: at(-72),
      venueName: "Cocoa House",
    });
    await opp(db, {
      ...ibadan,
      slug: "ongoing",
      title: "Ibadan build week",
      startsAt: at(-24),
      endsAt: at(24),
      publishedAt: at(-100),
    });
    await opp(db, {
      ...ibadan,
      slug: "past-event",
      title: "Past meetup",
      startsAt: at(-72),
      endsAt: at(-48),
      publishedAt: at(-200),
    });
    await opp(db, {
      organizationId: kuda.id,
      slug: "kuda-ios",
      title: "iOS Engineer",
      kind: "job",
      locationMode: "hybrid",
      country: "NG",
      city: "lagos",
      publishedAt: at(-480),
    });
    await opp(db, {
      organizationId: kuda.id,
      slug: "nationwide",
      title: "Nationwide fellowship",
      kind: "fellowship",
      locationMode: "onsite",
      country: "NG",
      deadlineAt: at(480),
      publishedAt: at(-120),
    });
    await opp(db, {
      organizationId: kuda.id,
      slug: "london",
      title: "London role",
      kind: "job",
      locationMode: "onsite",
      country: "GB",
      publishedAt: at(-26),
    });
  });

  const slugs = (p: { items: OpportunityDto[] } | OpportunityDto[]) =>
    ("items" in p ? p.items : p).map((o) => o.slug);
  const clock = { now: NOW };

  /** Follows nextCursor to the end and returns every slug in order. */
  async function walk(next: (cursor?: string) => Promise<Page<OpportunityDto>>) {
    const out: string[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const p = await next(cursor);
      out.push(...slugs(p));
      if (!p.nextCursor) return out;
      cursor = p.nextCursor;
    }
    throw new Error("pagination did not end");
  }

  it("returns DTOs that validate, with no internal field, and never a review item", async () => {
    const all = await data.listOpportunities({ status: "all", limit: 100 }, clock);
    for (const item of all.items) {
      expect(OpportunityDto.parse(item)).toEqual(item);
      expect(item).not.toHaveProperty("confidence");
      expect(item).not.toHaveProperty("identityKey");
    }
    expect(slugs(all)).toContain("closed");
    expect(slugs(all)).not.toContain("in-review");
    expect(slugs(all)).not.toContain("no-kind");
    const ibadan = all.items.find((o) => o.slug === "devfest-ibadan");
    expect(ibadan?.url).toBe("https://devspot.test/o/devfest-ibadan");
    expect(ibadan?.organization.url).toBe("https://devspot.test/org/gdg-ibadan");
    expect(ibadan?.venue).toEqual({ name: "Cocoa House", address: null, lat: null, lng: null });
    expect(all.items.find((o) => o.slug === "paypal")?.venue).toBeNull();
  });

  it("a review item is not found by slug; a closed one is", async () => {
    expect(await data.getOpportunity("in-review")).toBeNull();
    expect((await data.getOpportunity("closed"))?.status).toBe("closed");
  });

  it("sorts by deadline, soonest first, undated last; published only by default", async () => {
    const list = slugs(await data.listOpportunities({ limit: 100 }, clock));
    expect(list.slice(0, 5)).toEqual([
      "passed",
      "girls-who-code",
      "next-byte",
      "paypal",
      "nationwide",
    ]);
    expect(new Set(list.slice(5))).toEqual(
      new Set(["online-meetup", "devfest-ibadan", "ongoing", "past-event", "kuda-ios", "london"]),
    );
  });

  it.each(["deadline", "new", "updated"] as const)(
    "pages by %s with the cursor, with no gap and no repeat",
    async (sort) => {
      const whole = slugs(await data.listOpportunities({ sort, limit: 100 }, clock));
      const paged = await walk((cursor) =>
        data.listOpportunities({ sort, limit: 3, cursor }, clock),
      );
      expect(paged).toEqual(whole);
    },
  );

  it("a bad cursor is an InvalidCursor", async () => {
    await expect(data.listOpportunities({ cursor: "not-a-cursor" }, clock)).rejects.toBeInstanceOf(
      InvalidCursor,
    );
  });

  it("city=lagos&kinds=event gives only Lagos, nationwide or remote events", async () => {
    expect(slugs(await data.listOpportunities({ city: "lagos", kinds: ["event"] }, clock))).toEqual(
      ["online-meetup"],
    );
    const inIbadan = slugs(
      await data.listOpportunities({ city: "ibadan", kinds: ["event"] }, clock),
    );
    expect(new Set(inIbadan)).toEqual(
      new Set(["online-meetup", "devfest-ibadan", "ongoing", "past-event"]),
    );
  });

  it("filters by search, tags, organization, remote, country and closing window", async () => {
    const q = (f: Parameters<Data["listOpportunities"]>[0]) =>
      data.listOpportunities(f, clock).then(slugs);
    expect(await q({ q: "payments" })).toEqual(["paypal"]);
    expect(await q({ tags: ["ml", "women-in-tech"] })).toEqual(["girls-who-code", "next-byte"]);
    expect(new Set(await q({ org: "kuda" }))).toEqual(
      new Set(["nationwide", "kuda-ios", "london"]),
    );
    expect(await q({ country: "gb" })).toEqual(["london"]);
    expect(await q({ closingWithin: 7 })).toEqual(["girls-who-code", "next-byte"]);
    expect((await q({ remote: "1" })).every((s) => !["kuda-ios", "london"].includes(s))).toBe(true);
  });

  it("home: closing soon, new this week and near you", async () => {
    expect(slugs(await data.closingSoon(clock))).toEqual(["girls-who-code", "next-byte"]);
    expect(slugs(await data.newThisWeek(clock))).toEqual([
      "paypal",
      "london",
      "online-meetup",
      "girls-who-code",
      "devfest-ibadan",
      "ongoing",
      "nationwide",
    ]);
    expect(slugs(await data.nearYou("lagos"))).toEqual(["kuda-ios"]);
    expect(slugs(await data.nearYou("ibadan"))).toEqual([
      "past-event",
      "ongoing",
      "devfest-ibadan",
    ]);
  });

  it("counts: open, closing within 7 days and within 48 hours, by kind and by city", async () => {
    expect(await data.deadlineCounts(clock)).toEqual({
      open: 11,
      within7Days: 2,
      within48Hours: 1,
    });
    const byKind = await data.openCountsByKind();
    expect(byKind).toMatchObject({ hackathon: 4, event: 4, job: 2, fellowship: 1, internship: 0 });
    expect(await data.openCountsByCity()).toEqual({
      cities: [
        { city: "ibadan", count: 3 },
        { city: "lagos", count: 1 },
      ],
      remote: 5,
    });
  });

  it("related: the organization's other open items, then the kind in the city", async () => {
    const paypal = await data.getOpportunity("paypal");
    if (!paypal) throw new Error("seed missing");
    const r = await data.related(paypal);
    expect(slugs(r.sameOrganization)).toEqual([
      "passed",
      "girls-who-code",
      "next-byte",
      "online-meetup",
    ]);
    expect(r.sameOrganization.map((o) => o.slug)).not.toContain("paypal");
  });

  it("events: upcoming by start, an event under way included, a past one not", async () => {
    expect(slugs(await events.listEvents({}, clock))).toEqual([
      "ongoing",
      "devfest-ibadan",
      "online-meetup",
    ]);
    expect(slugs(await events.listEvents({ city: "lagos" }, clock))).toEqual(["online-meetup"]);
    expect(slugs(await events.listEvents({ to: at(100).toISOString() }, clock))).toEqual([
      "ongoing",
      "devfest-ibadan",
    ]);
    expect(await walk((cursor) => events.listEvents({ limit: 1, cursor }, clock))).toEqual([
      "ongoing",
      "devfest-ibadan",
      "online-meetup",
    ]);
  });

  describe("feed", () => {
    const prefs = (p: Partial<Preferences> = {}): Preferences => ({
      v: 1,
      kinds: [],
      tags: [],
      ...p,
    });

    it("puts deadlines in the next 14 days first, then the rest newest first", async () => {
      const list = slugs(await feedData.feed(prefs(), clock));
      expect(list).toEqual([
        "girls-who-code",
        "next-byte",
        "paypal",
        "online-meetup",
        "devfest-ibadan",
        "ongoing",
        "nationwide",
        "past-event",
        "passed",
        "kuda-ios",
      ]);
      expect(list).not.toContain("london");
    });

    it("pages across the two parts with no gap and no repeat", async () => {
      const whole = slugs(await feedData.feed(prefs(), clock));
      for (const limit of [1, 2, 3]) {
        const paged = await walk((cursor) => feedData.feed(prefs(), { ...clock, limit, cursor }));
        expect(paged).toEqual(whole);
      }
    });

    it("a city keeps remote and nationwide items and drops other cities", async () => {
      const list = slugs(await feedData.feed(prefs({ city: "lagos" }), clock));
      expect(list).toContain("kuda-ios");
      expect(list).toContain("nationwide");
      expect(list).toContain("paypal");
      expect(list).not.toContain("devfest-ibadan");
    });

    it("kinds, tags and remote only narrow it", async () => {
      expect(slugs(await feedData.feed(prefs({ kinds: ["job"] }), clock))).toEqual(["kuda-ios"]);
      expect(slugs(await feedData.feed(prefs({ tags: ["ml"] }), clock))).toEqual(["next-byte"]);
      const remote = slugs(await feedData.feed(prefs({ remoteOnly: true, city: "ibadan" }), clock));
      expect(remote).not.toContain("devfest-ibadan");
      expect(remote).toContain("online-meetup");
    });
  });
});
