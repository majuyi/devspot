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
    "TRUNCATE organizations, sources, fetch_runs, raw_items, opportunities, submissions CASCADE",
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
      ...o,
    },
  });
}
