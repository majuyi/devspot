import type { Prisma, PrismaClient } from "@devspot/db";
import { inject } from "vitest";
import { TEST_DATABASE } from "./global-setup";

export const hasDb = inject("databaseUrl") !== null;

export const NOW = new Date("2026-11-04T12:00:00Z");
const H = 3_600_000;
export const at = (hours: number) => new Date(NOW.getTime() + hours * H);

/** Empties the web test database. Refuses to run anywhere else. */
export async function reset(db: PrismaClient) {
  const [row] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (row?.name !== TEST_DATABASE) throw new Error(`refusing to reset ${row?.name}`);
  await db.$executeRawUnsafe(
    "TRUNCATE organizations, sources, fetch_runs, raw_items, opportunities, opportunity_events, submissions CASCADE",
  );
}

type Org = { slug: string; category?: Prisma.OrganizationCreateInput["category"] } & Partial<
  Omit<Prisma.OrganizationCreateInput, "slug" | "category">
>;

export async function org(db: PrismaClient, o: Org) {
  return db.organization.create({
    data: {
      name: o.slug,
      category: "employer",
      homepageUrl: `https://${o.slug}.example`,
      country: "NG",
      registryHash: "x",
      ...o,
    },
  });
}

export type Opp = Omit<
  Prisma.OpportunityUncheckedCreateInput,
  "slug" | "canonicalUrl" | "confidence" | "extractionMethod" | "discoveredVia" | "identityKey"
> & { slug: string };

export async function opp(db: PrismaClient, o: Opp) {
  return db.opportunity.create({
    data: {
      status: "published",
      kind: "hackathon",
      locationMode: "remote",
      canonicalUrl: `https://example.org/${o.slug}`,
      confidence: 0.9,
      extractionMethod: "rules",
      discoveredVia: "api",
      identityKey: o.slug,
      // As the engine stores it: a stated deadline is `fixed` unless the test says otherwise.
      deadlineKind: o.deadlineAt ? "fixed" : "unknown",
      ...o,
    },
  });
}

/**
 * A home page's worth of rows around NOW (Wed 4 Nov 2026, 13:00 in Lagos): every deadline
 * band, more "Later" items than home shows, events, and items in and outside Lagos.
 */
export async function seedHome(db: PrismaClient) {
  await reset(db);
  const acme = await org(db, { slug: "acme", name: "Acme", city: "lagos" });
  const source = (key: string, extra: Partial<Prisma.SourceUncheckedCreateInput> = {}) =>
    db.source.create({
      data: { organizationId: acme.id, key, kind: "api", url: `https://${key}.example`, ...extra },
    });
  await source("acme-jobs", { lastOkAt: at(-1) });
  await source("acme-events", { lastOkAt: at(-5.5) });
  await source("acme-blog", { lastOkAt: at(-2) });
  await source("acme-off", { enabled: false });

  const o = (slug: string, extra: Partial<Opp> = {}) =>
    opp(db, { organizationId: acme.id, slug, title: `Title ${slug}`, ...extra });
  const lagos = { locationMode: "onsite", country: "NG", city: "lagos" } as const;
  const event = { kind: "event", ...lagos } as const;

  await o("today", { deadlineAt: at(5), publishedAt: at(-24) });
  await o("tomorrow", { deadlineAt: at(20), publishedAt: at(-30) });
  // 23:00 in Lagos on the seventh day after today: the last hour of "This week".
  await o("edge-week", { deadlineAt: at(178) });
  for (let i = 1; i <= 7; i++) await o(`later-${i}`, { deadlineAt: at(156 + i * 24) });
  await o("rolling", { deadlineKind: "rolling", publishedAt: at(-2) });
  await o("multi", { deadlineKind: "multiRound", deadlineAt: at(30) });
  await o("passed", { deadlineAt: at(-5) });
  await o("closed", { status: "closed", deadlineAt: at(-200), closedAt: at(-190) });
  await o("in-review", { status: "review", deadlineAt: at(6) });

  await o("ev-today", { ...event, startsAt: at(-2) });
  await o("ev-ongoing", { ...event, startsAt: at(-30), endsAt: at(30) });
  await o("ev-deadline", { ...event, startsAt: at(40), deadlineAt: at(10) });
  await o("ev-a", { ...event, city: "ibadan", startsAt: at(50) });
  await o("ev-b", { ...event, city: "ibadan", startsAt: at(200) });
  await o("ev-c", { ...event, city: "ibadan", startsAt: at(300) });
  await o("ev-d", { ...event, city: "ibadan", startsAt: at(400) });

  await o("lagos-hybrid", { ...lagos, kind: "job", locationMode: "hybrid", deadlineAt: at(100) });
  await o("lagos-job", { ...lagos, kind: "job" });
  await o("nation", { kind: "fellowship", locationMode: "onsite", country: "NG" });
  await o("ibadan-job", { ...lagos, kind: "job", city: "ibadan" });
  await o("remote-ng", { kind: "internship", country: "NG" });
  // Enough undated rows that the open list runs to a second page.
  for (let i = 1; i <= 12; i++) await o(`bulk-${String(i).padStart(2, "0")}`, { kind: "bootcamp" });
}
