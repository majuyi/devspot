import { resolve } from "node:path";
import type { PrismaClient } from "@devspot/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { extractRules } from "../src/extract/rules.js";
import type { load as Load } from "../src/load.js";
import type { reextract as Reextract } from "../src/reextract.js";
import { validateDraft } from "../src/validate.js";

// Needs the Docker database, as test/raw-items.test.ts does.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch {}
}
const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb && process.env.CI) throw new Error("DATABASE_URL must be set in CI");

const SEEN = new Date("2026-10-13T08:00:00Z");
const NOW = new Date("2026-11-21T12:00:00Z");
const OPEN = "Location: Online\nDeadline: 30 November 2026\n\nRequirements\n\nBe 18 or over.";
const PAST = "Location: Online\nDeadline: 1 November 2026\n\nRequirements\n\nBe 18 or over.";

describe.skipIf(!hasDb)("engine reextract against Postgres", () => {
  let db: PrismaClient;
  let load: typeof Load;
  let reextract: typeof Reextract;
  const org = `test-reextract-${process.pid}-${Date.now()}`;
  const key = `${org}/feed`;
  const url = (path: string) => `https://example.org/${org}/${path}`;
  const quiet = () => {};

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    ({ load } = await import("../src/load.js"));
    ({ reextract } = await import("../src/reextract.js"));
  });
  const clear = async () => {
    await db.opportunity.deleteMany({ where: { organization: { slug: org } } });
    await db.organization.deleteMany({ where: { slug: org } });
  };
  beforeEach(async () => {
    await clear();
    await db.organization.create({
      data: {
        slug: org,
        name: "Reextract test",
        category: "hackathonHost",
        homepageUrl: "https://example.org",
        country: "NG",
        registryHash: "test",
        sources: { create: [{ key, kind: "feed", url: "https://example.org/feed" }] },
      },
    });
  });
  afterAll(async () => {
    await clear();
    await db?.$disconnect();
  });

  /**
   * A stored item and the row an older, harsher rule set loaded from it: same text, confidence
   * forced low, so it sits in review.
   */
  async function seed(path: string, text: string, row: Record<string, unknown> = {}) {
    const source = await db.source.findUniqueOrThrow({
      where: { key },
      include: { organization: true },
    });
    const rawItem = await db.rawItem.create({
      data: {
        sourceId: source.id,
        canonicalUrl: url(path),
        contentHash: path,
        title: `${path} Hackathon`,
        text,
        firstSeenAt: SEEN,
      },
    });
    const { draft } = extractRules({ item: rawItem, org: source.organization, now: SEEN });
    const input = validateDraft(draft, {
      organizationId: source.organization.id,
      rawItemId: rawItem.id,
      confidence: 0.3,
      extractionMethod: "rules",
      discoveredVia: "feed",
    });
    if (!input.success) throw input.error;
    const { id, status } = await load(input.data, {
      db,
      orgSlug: org,
      now: SEEN,
      firstSeenAt: SEEN,
    });
    expect(status).toBe("review");
    if (Object.keys(row).length) await db.opportunity.update({ where: { id }, data: row });
    return id;
  }

  it("previews without writing, then moves rows the loader may move", async () => {
    const open = await seed("open", OPEN);
    const past = await seed("past", PAST);
    const before = await db.opportunity.findMany({ where: { organization: { slug: org } } });

    const preview = await reextract({ db, now: NOW, log: quiet, source: key, dryRun: true });
    expect(preview).toMatchObject({ checked: 2, leftAlone: 0, invalid: 0, sameStatus: 0 });
    expect(preview.totals).toEqual({ "review → published": 1, "review → closed": 1 });
    expect(preview.moves.find((m) => m.url === url("open"))).toMatchObject({
      from: "review",
      to: "published",
      confidence: { from: 0.3 },
    });
    const after = await db.opportunity.findMany({ where: { organization: { slug: org } } });
    expect(after).toEqual(before);

    const applied = await reextract({ db, now: NOW, log: quiet, source: key });
    expect(applied.totals).toEqual(preview.totals);
    const rows = await db.opportunity.findMany({ where: { id: { in: [open, past] } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(open)).toMatchObject({ status: "published", publishedAt: NOW });
    expect(byId.get(past)).toMatchObject({
      status: "closed",
      statusReason: "date-passed",
      closedAt: NOW,
    });
    // A second pass finds nothing left to move.
    const again = await reextract({ db, now: NOW, log: quiet, source: key, dryRun: true });
    expect(again.moves).toEqual([]);
  });

  it("leaves reviewed, rejected, closed and copied rows alone", async () => {
    const ids = [
      await seed("reviewed", OPEN, { reviewedAt: SEEN }),
      await seed("rejected", OPEN, { status: "rejected", reviewedAt: SEEN }),
      await seed("closed", OPEN, { status: "closed", closedAt: SEEN }),
    ];
    const original = await seed("original", OPEN, { status: "published" });
    ids.push(await seed("copy", OPEN, { duplicateOfId: original }));
    const before = await db.opportunity.findMany({ where: { id: { in: ids } } });

    const summary = await reextract({ db, now: NOW, log: quiet, source: key });
    expect(summary.leftAlone).toBe(4);
    expect(await db.opportunity.findMany({ where: { id: { in: ids } } })).toEqual(before);
    expect(await db.opportunityEvent.count({ where: { opportunityId: { in: ids } } })).toBe(0);
  });

  it("loads a stored item that has no row yet", async () => {
    const source = await db.source.findUniqueOrThrow({ where: { key } });
    await db.rawItem.create({
      data: {
        sourceId: source.id,
        canonicalUrl: url("orphan"),
        contentHash: "orphan",
        title: "orphan Hackathon",
        text: OPEN,
        firstSeenAt: SEEN,
      },
    });
    const summary = await reextract({ db, now: NOW, log: quiet, source: key });
    expect(summary.totals).toEqual({ "new → published": 1 });
    expect(await db.opportunity.count({ where: { canonicalUrl: url("orphan") } })).toBe(1);
  });
});
