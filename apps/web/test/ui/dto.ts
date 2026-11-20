import type { OpportunityDto } from "@devspot/schema";

/** A whole public opportunity for the pure helpers' tests. */
export function dto(over: Partial<OpportunityDto> = {}): OpportunityDto {
  return {
    id: "opp_1",
    slug: "gwc-hackathon-26",
    url: "https://devspot.test/o/gwc-hackathon-26",
    title: "Girls Who Code HHS Hackathon 2026",
    kind: "hackathon",
    summary: "A weekend hackathon for students.",
    organization: { slug: "devpost", name: "Devpost", url: "https://devspot.test/org/devpost" },
    canonicalUrl: "https://devpost.com/hackathons/gwc",
    applyUrl: null,
    opensAt: null,
    // Thu 5 Nov 2026, 04:45 in Lagos.
    deadlineAt: "2026-11-05T03:45:00.000Z",
    deadlineKind: "fixed",
    deadlineTimezone: null,
    previousDeadlineAt: null,
    deadlineChangedAt: null,
    startsAt: null,
    endsAt: null,
    locationMode: "remote",
    country: null,
    city: null,
    venue: null,
    regionsTags: [],
    tags: [],
    requirementsText: "Open to students aged 13 to 18.\nTeams of up to four.",
    status: "published",
    firstSeenAt: "2026-10-20T08:00:00.000Z",
    publishedAt: "2026-10-21T08:00:00.000Z",
    lastVerifiedAt: "2026-11-04T10:00:00.000Z",
    closedAt: null,
    ...over,
  };
}

/** 23:59 in Lagos on Sat 7 Nov 2026: how a date-only deadline is stored. */
export const DATE_ONLY = "2026-11-07T22:59:00.000Z";

export const EVENT: Partial<OpportunityDto> = {
  kind: "event",
  title: "DevFest Ilorin 2026",
  deadlineAt: null,
  deadlineKind: "unknown",
  // Fri 6 Nov 2026, 10:00 to 17:00 in Lagos.
  startsAt: "2026-11-06T09:00:00.000Z",
  endsAt: "2026-11-06T16:00:00.000Z",
  locationMode: "onsite",
  country: "NG",
  city: "ilorin",
  venue: { name: "Kwara Hotel", address: "Ahmadu Bello Way, Ilorin", lat: null, lng: null },
};
