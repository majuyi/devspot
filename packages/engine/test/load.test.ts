import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { PrismaClient } from "@devspot/db";
import type { OpportunityDraft, OpportunityInput } from "@devspot/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  baseSlug,
  identityKey,
  load,
  meetsPublishRule,
  normalizeTitle,
  slugify,
} from "../src/load.js";
import { validateDraft } from "../src/validate.js";

// Needs the Docker database, as test/raw-items.test.ts does.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch {}
}
const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb && process.env.CI) throw new Error("DATABASE_URL must be set in CI");

const T0 = new Date("2026-10-13T08:00:00Z");
const T1 = new Date("2026-10-14T08:00:00Z");

const draft = (extra: Partial<OpportunityDraft> = {}): OpportunityDraft => ({
  isOpportunity: true,
  title: "Backend Internship 2026",
  canonicalUrl: "https://example.org/backend",
  kind: "internship",
  locationMode: "remote",
  deadlineKind: "fixed",
  deadlineAt: "2026-11-30T22:59:00.000Z",
  regionsTags: [],
  tags: [],
  fieldConfidence: {},
  evidence: [{ field: "deadline", quote: "30 November 2026" }],
  ...extra,
});
const ctx = {
  organizationId: "org",
  confidence: 0.85,
  extractionMethod: "rules",
  discoveredVia: "html",
} as const;

describe("slugify", () => {
  it.each([
    ["Backend Internship", "backend-internship"],
    ["  Women's  Tech: Lagos! ", "womens-tech-lagos"],
    ["Café Résumé Clinic", "cafe-resume-clinic"],
    ["₦250M InnovateNaija", "250m-innovatenaija"],
    ["日本語", ""],
  ])("%s", (text, slug) => expect(slugify(text)).toBe(slug));
});

describe("normalizeTitle", () => {
  it.each([
    ["HNG Internship 13", "HNG Internship"],
    ["Google Summer of Code 2026", "Google Summer of Code"],
    ["Cohort 3: Data Fellowship", "Data Fellowship"],
    ["Data Fellowship (Batch #2)", "Data Fellowship"],
    ["Data Fellowship, Season IV", "Data Fellowship"],
    ["5th Edition Founders Lab", "Founders Lab"],
    ["Web3 Bootcamp", "Web3 Bootcamp"],
    ["Top 100 Women in Tech", "Top 100 Women in Tech"],
  ])("%s", (title, want) => expect(normalizeTitle(title)).toBe(want));
});

describe("identityKey", () => {
  it("is the same for two sources announcing one cycle", () => {
    const a = identityKey("hng", { title: "HNG Internship 13" }, T0);
    const b = identityKey("hng", { title: "HNG internship: 2026" }, T0);
    expect(a).toBe("hng-hng-internship-2026");
    expect(b).toBe(a);
  });

  it("takes the cycle year from the deadline, then the start, then first sighting", () => {
    const title = "Fellowship";
    const deadlineAt = "2027-01-15T22:59:00.000Z";
    const startsAt = "2028-02-01T00:00:00.000Z";
    expect(identityKey("o", { title, deadlineAt, startsAt }, T0)).toBe("o-fellowship-2027");
    expect(identityKey("o", { title, startsAt }, T0)).toBe("o-fellowship-2028");
    expect(identityKey("o", { title }, T0)).toBe("o-fellowship-2026");
  });

  it("differs by organization", () => {
    expect(identityKey("a", { title: "Fellowship" }, T0)).not.toBe(
      identityKey("b", { title: "Fellowship" }, T0),
    );
  });
});

describe("baseSlug", () => {
  it("is org, title, two-digit year of first sighting", () => {
    expect(baseSlug("hng", "Backend Internship", T0)).toBe("hng-backend-internship-26");
  });
  it("keeps the org and year when the title has no latin letters", () => {
    expect(baseSlug("hng", "日本語", T0)).toBe("hng-26");
  });
  it("cuts a long title at a word", () => {
    const slug = baseSlug("o", "word ".repeat(40), T0);
    expect(slug).toMatch(/^o-(word-)+word-26$/);
    expect(slug.length).toBeLessThanOrEqual(65);
  });
});

describe("invariant 3: what may publish", () => {
  const base = {
    title: "Product Design Internship",
    kind: "internship",
    locationMode: "remote",
    confidence: 0.75,
    extractionMethod: "rules",
    deadlineAt: "2026-11-30T22:59:00.000Z",
  } as const;
  it("rules: 0.75 with a stated date", () => {
    expect(meetsPublishRule(base)).toBe(true);
    expect(meetsPublishRule({ ...base, deadlineAt: undefined, startsAt: base.deadlineAt })).toBe(
      true,
    );
  });
  it("rules: not below the threshold, and not without a date", () => {
    expect(meetsPublishRule({ ...base, confidence: 0.74 })).toBe(false);
    expect(meetsPublishRule({ ...base, deadlineAt: undefined })).toBe(false);
  });
  it("llm and manual: 0.8", () => {
    expect(meetsPublishRule({ ...base, extractionMethod: "llm" })).toBe(false);
    expect(meetsPublishRule({ ...base, extractionMethod: "llm", confidence: 0.8 })).toBe(true);
    expect(meetsPublishRule({ ...base, extractionMethod: "manual", confidence: 0.8 })).toBe(true);
  });
  it("not without a kind or a location mode, whatever the confidence", () => {
    const sure = { ...base, confidence: 1 };
    expect(meetsPublishRule({ ...sure, kind: undefined })).toBe(false);
    expect(meetsPublishRule({ ...sure, locationMode: undefined })).toBe(false);
    expect(meetsPublishRule({ ...sure, extractionMethod: "llm", kind: undefined })).toBe(false);
  });
  it("not when the title marks a test listing, unless a maintainer entered it", () => {
    const sure = { ...base, confidence: 1 };
    for (const title of [
      "Test Hackathon - Didit KYC",
      "  test",
      "Dummy listing",
      "Didit KYC test hackathon",
      "DevFest Lagos (test)",
    ])
      expect(meetsPublishRule({ ...sure, title }), title).toBe(false);
    for (const title of ["Testnet Builders Hackathon", "Contest 2026", "QA and Testing Internship"])
      expect(meetsPublishRule({ ...sure, title }), title).toBe(true);
    expect(
      meetsPublishRule({
        ...sure,
        extractionMethod: "manual",
        title: "Test Hackathon - Didit KYC",
      }),
    ).toBe(true);
  });
  it("validation passes a draft with no kind or location mode, for review", () => {
    expect(validateDraft(draft({ kind: undefined, locationMode: undefined }), ctx).success).toBe(
      true,
    );
  });
  it("validation reports a bad draft without throwing", () => {
    const bad = { ...draft(), canonicalUrl: "not a url" };
    expect(validateDraft(bad, ctx).error?.issues.map((i) => i.path.join("."))).toEqual([
      "canonicalUrl",
    ]);
  });
});

describe("invariant 4: the engine writes Opportunity only through the loader", () => {
  const src = resolve(import.meta.dirname, "../src");
  const files = (readdirSync(src, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(src, f));
  const matching = (re: RegExp) =>
    files.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => relative(src, f));

  it("only load.ts calls an Opportunity write", () => {
    const write = /\.opportunity\s*\.\s*(?:create|update|upsert|delete)/;
    expect(matching(write)).toEqual(["load.ts"]);
  });
  it("only the database stages import @devspot/db", () => {
    expect(matching(/from "@devspot\/db"/).sort()).toEqual([
      "load.ts",
      "raw-items.ts",
      "run.ts",
      "verify.ts",
    ]);
  });
});

describe.skipIf(!hasDb)("load against Postgres", () => {
  let db: PrismaClient;
  let organizationId: string;
  const orgSlug = `test-load-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    const org = await db.organization.create({
      data: {
        slug: orgSlug,
        name: "Load test",
        category: "community",
        homepageUrl: "https://example.org",
        country: "NG",
        registryHash: "test",
      },
    });
    organizationId = org.id;
  });
  beforeEach(async () => {
    await db.opportunity.updateMany({ where: { organizationId }, data: { duplicateOfId: null } });
    await db.opportunity.deleteMany({ where: { organizationId } });
  });
  afterAll(async () => {
    await db?.opportunity.updateMany({ where: { organizationId }, data: { duplicateOfId: null } });
    await db?.opportunity.deleteMany({ where: { organizationId } });
    await db?.organization.deleteMany({ where: { slug: orgSlug } });
    await db?.$disconnect();
  });

  const input = (
    extra: Partial<OpportunityDraft> = {},
    over: Partial<typeof ctx> | { confidence: number } = {},
  ): OpportunityInput => {
    const parsed = validateDraft(draft(extra), { ...ctx, organizationId, ...over });
    if (!parsed.success) throw parsed.error;
    return parsed.data;
  };
  const run = (i: OpportunityInput, now = T0) => load(i, { db, orgSlug, now, firstSeenAt: T0 });
  const row = (id: string) => db.opportunity.findUniqueOrThrow({ where: { id } });

  it("invariant 3: publishes what meets the rule and queues what does not", async () => {
    const ok = await run(input());
    expect(ok).toMatchObject({ status: "published", created: true });
    expect((await row(ok.id)).publishedAt).toEqual(T0);

    const low = await run(
      input({ title: "Low one", canonicalUrl: "https://example.org/low" }, { confidence: 0.5 }),
    );
    expect(low).toMatchObject({ status: "review", created: true });
    expect((await row(low.id)).publishedAt).toBeNull();

    const rolling = await run(
      input({
        title: "Rolling one",
        canonicalUrl: "https://example.org/rolling",
        deadlineKind: "rolling",
        deadlineAt: undefined,
      }),
    );
    expect(rolling.status).toBe("review");
  });

  it("invariant 3: a changed page moves a row between published and review", async () => {
    const { id } = await run(input());
    const down = await run(input({}, { confidence: 0.5 }), T1);
    expect(down).toEqual({ id, status: "review", created: false });

    const up = await run(input({}, { confidence: 0.9 }), T1);
    expect(up.status).toBe("published");
    // Still the first publication.
    expect((await row(id)).publishedAt).toEqual(T0);
  });

  it("sends an item with no kind or location to review, and publishes it once the page says", async () => {
    const { id, status } = await run(input({ kind: undefined, locationMode: undefined }));
    expect(status).toBe("review");
    expect(await row(id)).toMatchObject({ kind: null, locationMode: null, publishedAt: null });

    const filled = await run(input({ city: "lagos", locationMode: "onsite" }), T1);
    expect(filled).toEqual({ id, status: "published", created: false });
    expect(await row(id)).toMatchObject({
      kind: "internship",
      locationMode: "onsite",
      city: "lagos",
      publishedAt: T1,
    });

    const lost = await run(input({ kind: undefined }), T1);
    expect(lost.status).toBe("review");
    expect((await row(id)).kind).toBeNull();
  });

  it("stores the whole row on create, requirements verbatim", async () => {
    const requirementsText = "  You must be 18+.\n\n- Résumé   required  ";
    const { id } = await run(
      input({ requirementsText, tags: ["Backend", "not-a-tag"], city: "lagos", country: "NG" }),
    );
    expect(await row(id)).toMatchObject({
      slug: `${orgSlug}-backend-internship-2026-26`,
      identityKey: `${orgSlug}-backend-internship-2026`,
      requirementsText,
      tags: ["backend"],
      city: "lagos",
      deadlineAt: new Date("2026-11-30T22:59:00.000Z"),
      firstSeenAt: T0,
      discoveredVia: "html",
      extractionMethod: "rules",
      confidence: 0.85,
    });
    expect((await row(id)).extracted).toMatchObject({ title: "Backend Internship 2026" });
  });

  it("updates mutable fields by canonicalUrl and keeps the slug", async () => {
    const { id } = await run(input({ summary: "Old", requirementsText: "Old" }));
    const before = await row(id);
    const again = await run(
      input({
        title: "Backend Internship (Remote)",
        deadlineKind: "unknown",
        deadlineAt: undefined,
      }),
      T1,
    );
    expect(again).toMatchObject({ id, created: false });
    const after = await row(id);
    expect(after).toMatchObject({
      title: "Backend Internship (Remote)",
      slug: before.slug,
      identityKey: before.identityKey,
      summary: null,
      requirementsText: null,
      deadlineAt: null,
      deadlineKind: "unknown",
      lastVerifiedAt: T1,
    });
  });

  it("reviewed rows: only lastVerifiedAt changes", async () => {
    const { id } = await run(input({ summary: "Checked by a person" }));
    await db.opportunity.update({
      where: { id },
      data: { reviewedAt: T0, status: "rejected" },
    });
    const before = await row(id);
    const result = await run(input({ title: "Machine title", summary: "Machine" }), T1);
    expect(result).toEqual({ id, status: "rejected", created: false });
    const { updatedAt: _a, lastVerifiedAt, ...after } = await row(id);
    const { updatedAt: _b, lastVerifiedAt: _c, ...expected } = before;
    expect(after).toEqual(expected);
    expect(lastVerifiedAt).toEqual(T1);
  });

  it("never reopens a closed row", async () => {
    const { id } = await run(input());
    await db.opportunity.update({ where: { id }, data: { status: "closed" } });
    expect((await run(input(), T1)).status).toBe("closed");
  });

  it("invariant 6: a second announcement is a duplicate, in review, never published", async () => {
    const first = await run(input());
    const second = await run(
      input({ title: "Backend Internship", canonicalUrl: "https://other.example/backend" }),
    );
    expect(second).toMatchObject({ status: "review", created: true });
    expect((await row(second.id)).duplicateOfId).toBe(first.id);

    // A third points at the original, and new content does not publish a duplicate.
    const third = await run(
      input({ title: "Backend Internship!", canonicalUrl: "https://third.example/backend" }),
    );
    expect((await row(third.id)).duplicateOfId).toBe(first.id);
    const rerun = await run(
      input(
        { title: "Backend Internship", canonicalUrl: "https://other.example/backend" },
        { confidence: 0.95 },
      ),
      T1,
    );
    expect(rerun).toEqual({ id: second.id, status: "review", created: false });
  });

  it("invariant 6: one canonicalUrl from two sources is one row", async () => {
    const first = await run(input());
    const second = await run(input({ title: "Different heading" }), T1);
    expect(second).toMatchObject({ id: first.id, created: false });
    expect(await db.opportunity.count({ where: { organizationId } })).toBe(1);
  });

  it("gives a colliding slug a 4-character suffix", async () => {
    // Same title and year would be one identity, so collide through the deadline's year.
    await run(input());
    const other = input({
      canonicalUrl: "https://example.org/next-cycle",
      deadlineAt: "2027-03-01T22:59:00.000Z",
    });
    const { id, status } = await run(other);
    expect(status).toBe("published");
    const { slug } = await row(id);
    expect(slug).toMatch(new RegExp(`^${orgSlug}-backend-internship-2026-26-[0-9a-f]{4}$`));
  });
});
