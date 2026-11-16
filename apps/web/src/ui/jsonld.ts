import { findCity, type OpportunityDto } from "@devspot/schema";

type Json = Record<string, unknown>;

const organization = (o: OpportunityDto): Json => ({
  "@type": "Organization",
  name: o.organization.name,
  url: o.organization.url,
});

function place(o: OpportunityDto): Json {
  const city = o.city ? (findCity(o.city)?.name ?? o.city) : undefined;
  return {
    "@type": "Place",
    ...(o.venue?.name ? { name: o.venue.name } : {}),
    address: {
      "@type": "PostalAddress",
      ...(o.venue?.address ? { streetAddress: o.venue.address } : {}),
      ...(city ? { addressLocality: city } : {}),
      ...(o.country ? { addressCountry: o.country } : {}),
    },
  };
}

/**
 * schema.org data for an opportunity (docs/01 §1 Sharing): JobPosting for jobs and
 * internships, Event for events, Article otherwise. Only what the source stated: no salary,
 * no invented end date. The summary and dates are the same ones the page shows.
 */
export function opportunityJsonLd(o: OpportunityDto): Json {
  const description = o.summary ?? o.title;
  const posted = o.publishedAt ?? o.firstSeenAt;
  const base = { "@context": "https://schema.org", url: o.url, description };
  const hasDeadline =
    o.deadlineAt && (o.deadlineKind === "fixed" || o.deadlineKind === "multiRound");

  if (o.kind === "job" || o.kind === "internship") {
    const remote = o.locationMode === "remote";
    return {
      ...base,
      "@type": "JobPosting",
      title: o.title,
      datePosted: posted,
      ...(hasDeadline ? { validThrough: o.deadlineAt } : {}),
      ...(o.kind === "internship" ? { employmentType: "INTERN" } : {}),
      hiringOrganization: organization(o),
      ...(remote ? { jobLocationType: "TELECOMMUTE" } : { jobLocation: place(o) }),
      ...(remote && o.country
        ? { applicantLocationRequirements: { "@type": "Country", name: o.country } }
        : {}),
      // Applications happen on the organisation's site, never here.
      directApply: false,
    };
  }

  if (o.kind === "event" && o.startsAt) {
    const mode = { remote: "Online", onsite: "Offline", hybrid: "Mixed" }[o.locationMode];
    const online = { "@type": "VirtualLocation", url: o.canonicalUrl };
    return {
      ...base,
      "@type": "Event",
      name: o.title,
      startDate: o.startsAt,
      ...(o.endsAt ? { endDate: o.endsAt } : {}),
      eventAttendanceMode: `https://schema.org/${mode}EventAttendanceMode`,
      eventStatus: "https://schema.org/EventScheduled",
      location:
        o.locationMode === "remote"
          ? online
          : o.locationMode === "hybrid"
            ? [place(o), online]
            : place(o),
      organizer: organization(o),
    };
  }

  return {
    ...base,
    "@type": "Article",
    headline: o.title.slice(0, 110),
    datePublished: posted,
    dateModified: o.lastVerifiedAt ?? posted,
    mainEntityOfPage: o.url,
    about: organization(o),
  };
}

/** For a `<script type="application/ld+json">`: `<` escaped so no value can close the tag. */
export function jsonLdScript(data: Json): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
