import type { PrismaClient } from "@devspot/db";
import { identityKey } from "@devspot/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { at, hasDb, opp, org, reset } from "../seed";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const adminUrl = inject("adminDatabaseUrl");
const NOW = new Date("2026-11-04T12:00:00Z");

const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
};

describe.skipIf(!hasDb || !adminUrl)("/admin/new and Mark duplicate of, as the admin role", () => {
  let su: PrismaClient;
  let create: typeof import("../../src/admin/create");
  let data: typeof import("../../src/admin/data");
  const ids: Record<string, string> = {};
  const PAYSTACK = {
    org: "paystack",
    canonicalUrl: "https://paystack.com/careers/backend-intern",
    title: "Backend Engineering Intern",
    kind: "internship",
    locationMode: "hybrid",
    country: "NG",
    city: "lagos",
    deadlineKind: "fixed",
    deadlineAtDate: "2026-12-01",
    requirementsText: "Final-year students.\nLagos-based.",
  };

  beforeAll(async () => {
    process.env.ADMIN_DATABASE_URL = adminUrl ?? "";
    ({ db: su } = await import("@devspot/db"));
    create = await import("../../src/admin/create");
    data = await import("../../src/admin/data");
  });
  afterAll(() => {
    delete process.env.ADMIN_DATABASE_URL;
  });
  beforeEach(async () => {
    await reset(su);
    const paystack = await org(su, { slug: "paystack", name: "Paystack" });
    const hng = await org(su, { slug: "hng", name: "HNG" });
    const make = async (organizationId: string, slug: string, extra: object = {}) => {
      ids[slug] = (await opp(su, { organizationId, slug, title: `Title ${slug}`, ...extra })).id;
    };
    // Two cycles' announcements of one programme, from two pages: one identity key.
    const key = identityKey("hng", { title: "HNG Internship 13" }, at(0));
    await make(hng.id, "hng-a", {
      title: "HNG Internship 13",
      identityKey: key,
      status: "published",
      kind: "internship",
    });
    await make(hng.id, "hng-b", {
      title: "HNG internship: 2026",
      identityKey: key,
      status: "review",
    });
    await make(hng.id, "hng-gone", {
      title: "HNG Internship",
      identityKey: key,
      status: "rejected",
    });
    await make(paystack.id, "lonely", {
      identityKey: "paystack-lonely-2026",
      status: "published",
      kind: "job",
    });
  });

  describe("M2.10b check", () => {
    it("an item created for Paystack publishes, entered by hand, with its history", async () => {
      const to = await create.createManual(
        form({ ...PAYSTACK, intent: "publish", note: "from the careers page" }),
        NOW,
      );
      const row = await su.opportunity.findUniqueOrThrow({
        where: { canonicalUrl: PAYSTACK.canonicalUrl },
        include: { organization: true, events: true },
      });
      expect(to).toBe(`/admin/o/${row.id}?back=%2Fadmin&saved=1`);
      expect(row).toMatchObject({
        status: "published",
        title: "Backend Engineering Intern",
        kind: "internship",
        locationMode: "hybrid",
        city: "lagos",
        deadlineKind: "fixed",
        discoveredVia: "manual",
        extractionMethod: "manual",
        confidence: 1,
        rawItemId: null,
        slug: "paystack-backend-engineering-intern-26",
        // The same key the engine would compute, so the two dedupe against each other.
        identityKey: identityKey(
          "paystack",
          { title: PAYSTACK.title, deadlineAt: "2026-12-01T22:59:00.000Z" },
          NOW,
        ),
        requirementsText: "Final-year students.\nLagos-based.",
      });
      expect(row.organization.slug).toBe("paystack");
      expect(row.deadlineAt?.toISOString()).toBe("2026-12-01T22:59:00.000Z");
      expect(row.publishedAt).toEqual(NOW);
      expect(row.reviewedAt).toEqual(NOW);
      expect(row.events).toMatchObject([
        {
          actor: "admin",
          action: "created",
          changes: { status: { from: null, to: "published" } },
          note: "from the careers page",
        },
      ]);
    });

    it("a second item with the same page address is refused and sent to the existing one", async () => {
      await create.createManual(form({ ...PAYSTACK, intent: "publish" }), NOW);
      const to = await create.createManual(
        form({ ...PAYSTACK, title: "Another title", intent: "publish" }),
        NOW,
      );
      expect(to).toBe(
        create.newHref({ org: "paystack", url: PAYSTACK.canonicalUrl, title: "Another title" }),
      );
      expect(await su.opportunity.count({ where: { canonicalUrl: PAYSTACK.canonicalUrl } })).toBe(
        1,
      );
      // Step one, at that address, shows what is already there.
      const found = await data.findExisting(
        "paystack",
        PAYSTACK.canonicalUrl,
        "Another title",
        NOW,
      );
      expect(found.sameUrl?.title).toBe("Backend Engineering Intern");
    });
  });

  describe("creating", () => {
    it("save without publishing keeps it in review and needs no kind or location", async () => {
      await create.createManual(
        form({
          org: "paystack",
          canonicalUrl: "https://paystack.com/x",
          title: "Draft",
          deadlineKind: "unknown",
          intent: "save",
        }),
        NOW,
      );
      expect(
        await su.opportunity.findUniqueOrThrow({
          where: { canonicalUrl: "https://paystack.com/x" },
        }),
      ).toMatchObject({
        status: "review",
        kind: null,
        publishedAt: null,
      });
    });

    it.each([
      [{ org: "nobody" }, "Choose an organisation from the registry."],
      [{ canonicalUrl: "not a url" }, "The page address must be a web address."],
      [{ canonicalUrl: "javascript:alert(1)" }, "The page address must be a web address."],
      [{ kind: "" }, "Kind: choose one before publishing"],
      [
        { deadlineKind: "unknown" },
        'Deadline: a "unknown" deadline has no date. Choose fixed or rounds.',
      ],
    ])("refuses %o with its reason and writes nothing", async (over, message) => {
      const to = await create.createManual(form({ ...PAYSTACK, ...over, intent: "publish" }), NOW);
      expect(new URL(to, "https://x").searchParams.get("error")).toBe(message);
      expect(await su.opportunity.count({ where: { organization: { slug: "paystack" } } })).toBe(1);
    });

    it("a title already taken by another slug gets the URL-derived suffix, as the engine's", async () => {
      await create.createManual(form({ ...PAYSTACK, intent: "save" }), NOW);
      await create.createManual(
        form({ ...PAYSTACK, canonicalUrl: "https://paystack.com/careers/other", intent: "save" }),
        NOW,
      );
      const slugs = (
        await su.opportunity.findMany({ where: { title: PAYSTACK.title }, select: { slug: true } })
      ).map((r) => r.slug);
      expect(slugs).toHaveLength(2);
      expect(slugs).toContain("paystack-backend-engineering-intern-26");
      expect(slugs.find((s) => s !== "paystack-backend-engineering-intern-26")).toMatch(
        /^paystack-backend-engineering-intern-26-[0-9a-f]{4}$/,
      );
    });

    it("step one shows rows sharing the identity key on another page, not the same page", async () => {
      const found = await data.findExisting(
        "hng",
        "https://hng.tech/new-page",
        "HNG Internship 14",
        at(0),
      );
      expect(found.sameUrl).toBeNull();
      expect(found.sameKey.map((r) => r.title).sort()).toEqual([
        "HNG Internship",
        "HNG Internship 13",
        "HNG internship: 2026",
      ]);
      expect(
        (await data.findExisting("paystack", "https://paystack.com/y", "Something new", NOW))
          .sameKey,
      ).toEqual([]);
    });
  });

  describe("duplicates", () => {
    it("the tab groups live rows sharing an identity key, leaving out rejected ones and singles", async () => {
      const groups = await data.listDuplicateGroups();
      expect(groups.map((g) => g.rows.map((r) => r.title))).toEqual([
        ["HNG Internship 13", "HNG internship: 2026"],
      ]);
      expect((await data.tabCounts()).duplicates).toBe(1);
    });

    it("marking one a duplicate takes it off the site, links the original, records it, and clears the group", async () => {
      const to = await create.markDuplicateOf(
        form({
          id: ids["hng-b"] as string,
          originalId: ids["hng-a"] as string,
          back: "/admin?tab=duplicates",
          note: "same cohort",
        }),
      );
      expect(to).toBe(
        `/admin/o/${ids["hng-b"]}?back=${encodeURIComponent("/admin?tab=duplicates")}`,
      );
      const row = await su.opportunity.findUniqueOrThrow({
        where: { id: ids["hng-b"] },
        include: { events: true },
      });
      expect(row).toMatchObject({
        status: "rejected",
        duplicateOfId: ids["hng-a"],
        statusReason: "Duplicate of HNG Internship 13",
      });
      expect(row.events).toMatchObject([
        {
          action: "markedDuplicate",
          changes: {
            status: { from: "review", to: "rejected" },
            duplicateOf: { from: null, to: "hng-a" },
          },
          note: "same cohort",
        },
      ]);
      expect(await data.listDuplicateGroups()).toEqual([]);
    });

    it("a published copy marked as a duplicate leaves the site", async () => {
      await create.markDuplicateOf(
        form({ id: ids["hng-a"] as string, originalId: ids["hng-b"] as string }),
      );
      expect((await su.opportunity.findUniqueOrThrow({ where: { id: ids["hng-a"] } })).status).toBe(
        "rejected",
      );
    });

    it("never itself, never onto a duplicate, so there are no loops", async () => {
      const self = await create.markDuplicateOf(
        form({ id: ids["hng-b"] as string, originalId: ids["hng-b"] as string }),
      );
      expect(self).toContain("error=");
      await create.markDuplicateOf(
        form({ id: ids["hng-b"] as string, originalId: ids["hng-a"] as string }),
      );
      const loop = await create.markDuplicateOf(
        form({ id: ids["hng-a"] as string, originalId: ids["hng-b"] as string }),
      );
      expect(decodeURIComponent(loop)).toContain(
        "Choose an original that is not itself a duplicate.",
      );
      expect((await su.opportunity.findUniqueOrThrow({ where: { id: ids["hng-a"] } })).status).toBe(
        "published",
      );
    });

    it("the search finds other live rows by title or address, not itself or rejected ones", async () => {
      const found = await data.duplicateCandidates(ids["hng-b"] as string, "hng internship");
      expect(found.map((r) => r.title)).toEqual(["HNG Internship 13"]);
      expect(
        (await data.duplicateCandidates(ids["hng-b"] as string, "example.org/lonely")).map(
          (r) => r.title,
        ),
      ).toEqual(["Title lonely"]);
    });
  });

  describe("sources erroring", () => {
    it("lists erroring then stale sources with the last failure; healthy and new ones are left out", async () => {
      const paystack = await su.organization.findUniqueOrThrow({ where: { slug: "paystack" } });
      const source = async (key: string, runs: number, extra: object = {}) => {
        const s = await su.source.create({
          data: {
            organizationId: paystack.id,
            key,
            kind: "html",
            url: `https://${key}.example`,
            ...extra,
          },
        });
        for (let i = 0; i < runs; i++) {
          await su.fetchRun.create({
            data: {
              sourceId: s.id,
              ok: i > 0,
              startedAt: at(-10 - i),
              finishedAt: at(-9 - i),
              ...(i === 0 ? { httpStatus: 403, error: "Forbidden by Cloudflare" } : {}),
            },
          });
        }
      };
      await source("a-erroring", 5, { consecutiveErrors: 3 });
      await source("b-stale", 5, { consecutiveEmpty: 9, baselineWeeklyYield: 4 });
      await source("c-healthy", 5);
      await source("d-new", 1, { consecutiveErrors: 1 });
      const rows = await data.troubledSources();
      expect(rows.map((r) => [r.key, r.health])).toEqual([
        ["a-erroring", "erroring"],
        ["b-stale", "stale"],
      ]);
      expect(rows[0]?.fetchRuns[0]).toMatchObject({
        httpStatus: 403,
        error: "Forbidden by Cloudflare",
      });
      expect((await data.tabCounts()).sources).toBe(2);
    });
  });
});
