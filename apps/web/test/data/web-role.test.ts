import type { PrismaClient } from "@devspot/db";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { at, hasDb, NOW, opp, org, reset } from "../seed";

const webUrl = inject("webDatabaseUrl");
const clearSingleton = () => {
  delete (globalThis as { db?: PrismaClient }).db;
};

/**
 * Production's Vercel connects as `web`, which has only the grants in grants.sql. CI and the
 * other tests connect as a superuser, so without this file a query on a table `web` cannot
 * read would pass every check and fail in production with "permission denied".
 */
describe.skipIf(!hasDb || !webUrl)("the data layer as the restricted web role", () => {
  let su: PrismaClient;
  const suUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    const { createClient } = await import("@devspot/db");
    su = createClient(suUrl ?? "");
    await reset(su);
    const o = await org(su, { slug: "zindi", city: "lagos" });
    await su.source.create({
      data: { organizationId: o.id, key: "zindi/api", kind: "api", url: "https://zindi.example" },
    });
    await opp(su, {
      organizationId: o.id,
      slug: "c",
      title: "Challenge",
      kind: "competition",
      deadlineAt: at(48),
      publishedAt: at(-1),
    });
    await opp(su, {
      organizationId: o.id,
      slug: "e",
      title: "Meetup",
      kind: "event",
      locationMode: "onsite",
      country: "NG",
      city: "lagos",
      startsAt: at(24),
      publishedAt: at(-1),
    });
    // From here on, the singleton every data function uses connects as web.
    clearSingleton();
    process.env.DATABASE_URL = webUrl ?? "";
  });

  afterAll(async () => {
    const { db } = await import("@devspot/db");
    await db.$disconnect();
    clearSingleton();
    process.env.DATABASE_URL = suUrl;
    await su.$disconnect();
  });

  it("every query the pages and API make is allowed", async () => {
    const o = await import("../../src/data/opportunities");
    const clock = { now: NOW };
    expect((await o.listOpportunities({ q: "challenge", limit: 5 }, clock)).items).toHaveLength(1);
    expect(await o.getOpportunity("c")).not.toBeNull();
    await o.closingSoon(clock);
    await o.newThisWeek(clock);
    await o.nearYou("lagos");
    await o.deadlineCounts(clock);
    await o.openCountsByKind();
    await o.openCountsByCity();
    const c = await o.getOpportunity("c");
    if (c) await o.related(c);
    const { listEvents } = await import("../../src/data/events");
    expect((await listEvents({}, clock)).items).toHaveLength(1);
    const { feed } = await import("../../src/data/feed");
    await feed({ v: 1, kinds: [], tags: [] }, clock);
    const orgs = await import("../../src/data/organizations");
    expect((await orgs.listOrganizations()).items[0]?.sources).toHaveLength(1);
    await orgs.getOrganization("zindi");
    const { getMeta } = await import("../../src/data/meta");
    await getMeta(clock);
    const { getStatus } = await import("../../src/data/status");
    await getStatus(clock);
  });

  it("cannot write or read the engine's tables", async () => {
    const { db } = await import("@devspot/db");
    await expect(
      db.opportunity.updateMany({ where: { slug: "c" }, data: { title: "x" } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.opportunity.deleteMany({ where: { slug: "c" } })).rejects.toThrow(
      /permission denied/i,
    );
    await expect(db.rawItem.count()).rejects.toThrow(/permission denied/i);
  });
});
