import { resolve } from "node:path";
import type { PrismaClient } from "@devspot/db";
import type { RawItemInput } from "@devspot/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contentHash } from "../src/dedupe.js";
import type { upsertRawItems as Upsert } from "../src/raw-items.js";

// Needs the Docker database (CONTRIBUTING). CI always has one; locally the root .env says
// where it is, and without one these tests skip rather than fail a fresh clone.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch {}
}
const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb && process.env.CI) throw new Error("DATABASE_URL must be set in CI");

describe.skipIf(!hasDb)("upsertRawItems against Postgres", () => {
  let db: PrismaClient;
  let upsertRawItems: typeof Upsert;
  let sourceId: string;
  const slug = `test-dedupe-${process.pid}-${Date.now()}`;
  const t0 = new Date("2026-10-13T08:00:00Z");
  const t1 = new Date("2026-10-13T14:00:00Z");

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    ({ upsertRawItems } = await import("../src/raw-items.js"));
    const org = await db.organization.create({
      data: {
        slug,
        name: "Dedupe test",
        category: "community",
        homepageUrl: "https://example.org",
        country: "NG",
        registryHash: "test",
        sources: { create: { key: `${slug}/site`, kind: "html", url: "https://example.org" } },
      },
      include: { sources: true },
    });
    sourceId = org.sources[0]?.id ?? "";
  });

  afterAll(async () => {
    await db?.organization.deleteMany({ where: { slug } });
    await db?.$disconnect();
  });

  const rows = () => db.rawItem.findMany({ where: { sourceId }, orderBy: { canonicalUrl: "asc" } });
  const item = (path: string, text: string, extra: Partial<RawItemInput> = {}): RawItemInput => ({
    url: `https://example.org${path}`,
    text,
    ...extra,
  });

  it("creates new items under their canonical URL, first of a duplicate pair winning", async () => {
    const result = await upsertRawItems(
      db,
      sourceId,
      [
        item("/a/?utm_source=x", "Apply by 1 Nov.", {
          title: "A",
          publishedAt: "2026-10-01T00:00:00.000Z",
          meta: { links: [{ text: "Apply", href: "https://example.org/apply" }] },
        }),
        item("/b", "Rolling."),
        item("/a#again", "A second copy of A"),
      ],
      t0,
    );
    expect(result.found).toBe(2);
    expect(result.unchanged).toBe(0);
    expect(result.fresh.map((f) => [f.status, f.rawItem.canonicalUrl])).toEqual([
      ["new", "https://example.org/a"],
      ["new", "https://example.org/b"],
    ]);
    const [a] = await rows();
    expect(a).toMatchObject({
      canonicalUrl: "https://example.org/a",
      title: "A",
      text: "Apply by 1 Nov.",
      contentHash: contentHash("Apply by 1 Nov."),
      publishedAt: new Date("2026-10-01T00:00:00Z"),
      meta: { links: [{ text: "Apply", href: "https://example.org/apply" }] },
      firstSeenAt: t0,
      lastSeenAt: t0,
      seenCount: 1,
    });
  });

  it("bumps lastSeenAt and seenCount on the same hash, and returns nothing", async () => {
    const result = await upsertRawItems(
      db,
      sourceId,
      [item("/a", "Apply  by 1 Nov.", { title: "A, retitled" }), item("/b", "Rolling.")],
      t1,
    );
    expect(result).toEqual({ found: 2, fresh: [], unchanged: 2 });
    const [a, b] = await rows();
    expect(a).toMatchObject({ title: "A", firstSeenAt: t0, lastSeenAt: t1, seenCount: 2 });
    expect(b).toMatchObject({ lastSeenAt: t1, seenCount: 2 });
  });

  it("replaces content on a different hash and reports it as changed", async () => {
    const t2 = new Date("2026-10-14T08:00:00Z");
    const result = await upsertRawItems(
      db,
      sourceId,
      [item("/a", "Apply by 15 Nov.", { title: "A" }), item("/c", "New one.")],
      t2,
    );
    expect(result.unchanged).toBe(0);
    expect(result.fresh.map((f) => [f.status, f.rawItem.canonicalUrl])).toEqual([
      ["changed", "https://example.org/a"],
      ["new", "https://example.org/c"],
    ]);
    const [a, b] = await rows();
    expect(a).toMatchObject({
      text: "Apply by 15 Nov.",
      contentHash: contentHash("Apply by 15 Nov."),
      meta: null,
      publishedAt: null,
      firstSeenAt: t0,
      lastSeenAt: t2,
      seenCount: 3,
    });
    expect(b).toMatchObject({ lastSeenAt: t1, seenCount: 2 });
    expect(await rows()).toHaveLength(3);
  });

  it("keeps sources apart: the same URL from another source is its own row", async () => {
    const other = await db.source.create({
      data: {
        key: `${slug}/other`,
        kind: "feed",
        url: "https://example.org/feed",
        organization: { connect: { slug } },
      },
    });
    const result = await upsertRawItems(db, other.id, [item("/a", "Apply by 15 Nov.")], t1);
    expect(result.fresh.map((f) => f.status)).toEqual(["new"]);
  });
});
