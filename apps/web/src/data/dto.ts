import type { Opportunity, Prisma } from "@devspot/db";
import type { OpportunityDto } from "@devspot/schema";
import { siteUrl } from "./site";

/**
 * What the public may see: published and closed rows (docs/06 §1). Kind and location mode are
 * nullable only for rows in review, and the guard keeps a hand-edited row from breaking a DTO.
 */
export const PUBLIC: Prisma.OpportunityWhereInput = {
  status: { in: ["published", "closed"] },
  kind: { not: null },
  locationMode: { not: null },
};

/** Published and not closed: what "open" means on every page and count. */
export const OPEN: Prisma.OpportunityWhereInput = { ...PUBLIC, status: "published" };

export const withOrganization = {
  organization: { select: { slug: true, name: true } },
} satisfies Prisma.OpportunityInclude;

export type OpportunityRow = Opportunity & { organization: { slug: string; name: string } };

/** A row the public filter should have kept out. A bug, never a reader-facing state. */
export class NotPublic extends Error {
  override readonly name = "NotPublic";
  constructor(id: string) {
    super(`opportunity ${id} is not public`);
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** Public fields only: never confidence, extracted, identityKey or raw ids (docs/06 §2). */
export function toOpportunityDto(row: OpportunityRow): OpportunityDto {
  const { kind, locationMode, status } = row;
  if (!kind || !locationMode || (status !== "published" && status !== "closed")) {
    throw new NotPublic(row.id);
  }
  const site = siteUrl();
  const hasVenue =
    row.venueName !== null || row.venueAddress !== null || row.lat !== null || row.lng !== null;
  return {
    id: row.id,
    slug: row.slug,
    url: `${site}/o/${row.slug}`,
    title: row.title,
    kind,
    summary: row.summary,
    organization: {
      slug: row.organization.slug,
      name: row.organization.name,
      url: `${site}/org/${row.organization.slug}`,
    },
    canonicalUrl: row.canonicalUrl,
    applyUrl: row.applyUrl,
    opensAt: iso(row.opensAt),
    deadlineAt: iso(row.deadlineAt),
    deadlineKind: row.deadlineKind,
    deadlineTimezone: row.deadlineTimezone,
    startsAt: iso(row.startsAt),
    endsAt: iso(row.endsAt),
    locationMode,
    country: row.country,
    city: row.city,
    venue: hasVenue
      ? { name: row.venueName, address: row.venueAddress, lat: row.lat, lng: row.lng }
      : null,
    regionsTags: row.regionsTags,
    tags: row.tags,
    requirementsText: row.requirementsText,
    status,
    firstSeenAt: row.firstSeenAt.toISOString(),
    publishedAt: iso(row.publishedAt),
    lastVerifiedAt: iso(row.lastVerifiedAt),
    closedAt: iso(row.closedAt),
  };
}
