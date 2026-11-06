import type { PrismaClient } from "@devspot/db";
import { OrganizationDto } from "@devspot/schema";
import { beforeAll, describe, expect, it } from "vitest";
import { at, hasDb, NOW, opp, org, reset } from "../seed";

type Orgs = typeof import("../../src/data/organizations");
type Meta = typeof import("../../src/data/meta");
type Status = typeof import("../../src/data/status");

describe.skipIf(!hasDb)("organization, meta and status queries", () => {
  let db: PrismaClient;
  let orgs: Orgs;
  let meta: Meta;
  let status: Status;

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    orgs = await import("../../src/data/organizations");
    meta = await import("../../src/data/meta");
    status = await import("../../src/data/status");
    await reset(db);
    const zindi = await org(db, { slug: "zindi", category: "community", city: "lagos" });
    const hng = await org(db, { slug: "hng", category: "trainingProvider" });
    const gone = await org(db, { slug: "gone", enabled: false });
    const source = (organizationId: string, key: string, extra: object = {}) =>
      db.source.create({
        data: {
          organizationId,
          key,
          kind: "api",
          url: `https://${key.replace("/", ".")}.example`,
          ...extra,
        },
      });
    const competitions = await source(zindi.id, "zindi/competitions", {
      lastOkAt: at(-6),
      consecutiveErrors: 0,
    });
    const site = await source(hng.id, "hng/site", { consecutiveErrors: 3 });
    await source(hng.id, "hng/blog");
    await source(gone.id, "gone/site");
    for (const [sourceId, n] of [
      [competitions.id, 5],
      [site.id, 4],
    ] as const) {
      for (let i = 0; i < n; i++) {
        await db.fetchRun.create({
          data: { sourceId, ok: true, startedAt: at(-10 - i), finishedAt: at(-9 - i) },
        });
      }
    }
    await opp(db, {
      organizationId: zindi.id,
      slug: "zindi-a",
      title: "A",
      kind: "competition",
      publishedAt: at(-24),
    });
    await opp(db, {
      organizationId: zindi.id,
      slug: "zindi-b",
      title: "B",
      kind: "competition",
      publishedAt: at(-240),
    });
    await opp(db, { organizationId: zindi.id, slug: "zindi-old", title: "Old", status: "closed" });
    await opp(db, {
      organizationId: hng.id,
      slug: "hng-review",
      title: "Review",
      status: "review",
    });
  });

  it("lists enabled organizations with open counts and source health, by slug", async () => {
    const { items, nextCursor } = await orgs.listOrganizations();
    expect(nextCursor).toBeNull();
    expect(items.map((o) => o.slug)).toEqual(["hng", "zindi"]);
    for (const o of items) expect(OrganizationDto.parse(o)).toEqual(o);
    const [hng, zindi] = items;
    expect(zindi?.openCount).toBe(2);
    expect(zindi?.url).toBe("https://devspot.test/org/zindi");
    expect(zindi?.sources).toEqual([
      expect.objectContaining({
        key: "zindi/competitions",
        health: "healthy",
        lastOkAt: at(-6).toISOString(),
      }),
    ]);
    expect(hng?.openCount).toBe(0);
    expect(hng?.sources.map((s) => [s.key, s.health])).toEqual([
      ["hng/blog", "new"],
      ["hng/site", "erroring"],
    ]);
  });

  it("filters and pages", async () => {
    expect(
      (await orgs.listOrganizations({ category: "community" })).items.map((o) => o.slug),
    ).toEqual(["zindi"]);
    expect((await orgs.listOrganizations({ city: "lagos" })).items.map((o) => o.slug)).toEqual([
      "zindi",
    ]);
    const first = await orgs.listOrganizations({ limit: 1 });
    expect(first.items.map((o) => o.slug)).toEqual(["hng"]);
    const second = await orgs.listOrganizations({ limit: 1, cursor: first.nextCursor ?? "" });
    expect(second.items.map((o) => o.slug)).toEqual(["zindi"]);
    expect(second.nextCursor).toBeNull();
  });

  it("a disabled organization is not found", async () => {
    expect(await orgs.getOrganization("gone")).toBeNull();
    expect((await orgs.getOrganization("zindi"))?.openCount).toBe(2);
  });

  it("meta counts what is enabled and open, and the last run", async () => {
    const m = await meta.getMeta({ now: NOW });
    expect(m.counts).toEqual({ organizations: 2, sources: 3, openOpportunities: 2 });
    expect(m.lastEngineRunAt).toBe(at(-9).toISOString());
    expect(m.kinds).toContain("ossProgram");
    expect(m.cities.find((c) => c.slug === "lagos")).toEqual({
      slug: "lagos",
      name: "Lagos",
      state: "Lagos",
    });
  });

  it("status sorts sources worst first, as engine health does", async () => {
    const s = await status.getStatus({ now: NOW });
    expect(s.sources.map((r) => [r.key, r.health])).toEqual([
      ["hng/site", "erroring"],
      ["hng/blog", "new"],
      ["zindi/competitions", "healthy"],
      ["gone/site", "disabled"],
    ]);
    expect(s.counts).toEqual({
      organizations: 2,
      sources: 3,
      openOpportunities: 2,
      publishedThisWeek: 1,
    });
    expect(s.lastEngineRunAt).toBe(at(-9).toISOString());
  });
});
