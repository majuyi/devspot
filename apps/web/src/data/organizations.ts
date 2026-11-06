import { db, type Prisma } from "@devspot/db";
import {
  type CitySlug,
  type OrganizationDto,
  type OrgCategory,
  sourceHealth,
} from "@devspot/schema";
import { z } from "zod";
import { decodeCursor, encodeCursor } from "./cursor";
import { OPEN } from "./dto";
import type { Page } from "./opportunities";
import { siteUrl } from "./site";

export type OrganizationFilters = {
  category?: OrgCategory;
  country?: string;
  city?: CitySlug;
  limit?: number;
  cursor?: string;
};

const include = {
  sources: {
    orderBy: { key: "asc" },
    include: { _count: { select: { fetchRuns: true } } },
  },
  _count: { select: { opportunities: { where: OPEN } } },
} satisfies Prisma.OrganizationInclude;

type OrganizationRow = Prisma.OrganizationGetPayload<{ include: typeof include }>;

function toOrganizationDto(o: OrganizationRow): OrganizationDto {
  return {
    slug: o.slug,
    name: o.name,
    url: `${siteUrl()}/org/${o.slug}`,
    category: o.category,
    homepageUrl: o.homepageUrl,
    description: o.description,
    country: o.country,
    city: o.city,
    logoUrl: o.logoUrl,
    openCount: o._count.opportunities,
    sources: o.sources.map((s) => ({
      key: s.key,
      kind: s.kind,
      url: s.url,
      health: sourceHealth({ ...s, enabled: s.enabled && o.enabled }, s._count.fetchRuns),
      lastOkAt: s.lastOkAt?.toISOString() ?? null,
    })),
  };
}

const SlugCursor = z.object({ slug: z.string().min(1) });

/** Enabled organizations by slug. `/org` groups them by category itself. */
export async function listOrganizations(
  f: OrganizationFilters = {},
): Promise<Page<OrganizationDto>> {
  const limit = f.limit ?? 30;
  const after = decodeCursor(f.cursor, SlugCursor);
  const rows = await db.organization.findMany({
    where: {
      enabled: true,
      ...(f.category && { category: f.category }),
      ...(f.country && { country: f.country.toUpperCase() }),
      ...(f.city && { city: f.city }),
      ...(after && { slug: { gt: after.slug } }),
    },
    orderBy: { slug: "asc" },
    include,
    take: limit + 1,
  });
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(toOrganizationDto),
    nextCursor: rows.length > limit && last ? encodeCursor({ slug: last.slug }) : null,
  };
}

export async function getOrganization(slug: string): Promise<OrganizationDto | null> {
  const row = await db.organization.findFirst({ where: { slug, enabled: true }, include });
  return row ? toOrganizationDto(row) : null;
}
