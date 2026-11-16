import { findCity, type OrgCategory, type SourceHealth, type SourceKind } from "@devspot/schema";

/** `/org` lists categories in this order; one with no organisations is left out. */
export const CATEGORY_ORDER: OrgCategory[] = [
  "employer",
  "community",
  "hackathonHost",
  "fellowshipFunder",
  "scholarshipFunder",
  "ossProgram",
  "trainingProvider",
  "accelerator",
  "government",
  "university",
];

export const CATEGORY_PLURAL: Record<OrgCategory, string> = {
  employer: "Employers",
  community: "Communities",
  hackathonHost: "Hackathon hosts",
  fellowshipFunder: "Fellowship funders",
  scholarshipFunder: "Scholarship funders",
  ossProgram: "Open-source programmes",
  trainingProvider: "Training providers",
  accelerator: "Accelerators",
  government: "Government",
  university: "Universities",
};

export const CATEGORY_LABEL: Record<OrgCategory, string> = {
  employer: "Employer",
  community: "Community",
  hackathonHost: "Hackathon host",
  fellowshipFunder: "Fellowship funder",
  scholarshipFunder: "Scholarship funder",
  ossProgram: "Open-source programme",
  trainingProvider: "Training provider",
  accelerator: "Accelerator",
  government: "Government",
  university: "University",
};

/** How a source is read, in a reader's words. */
export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  feed: "Feed",
  sitemap: "Sitemap",
  html: "Web page",
  api: "API",
  manual: "Entered by hand",
};

const WORST_FIRST: SourceHealth[] = ["erroring", "stale", "new", "healthy", "disabled"];

/**
 * An organisation's health is its worst source's, so trouble is never averaged away. Disabled
 * sources count only when there is nothing else; with no sources at all it is `new`.
 */
export function worstHealth(states: readonly SourceHealth[]): SourceHealth {
  if (states.length === 0) return "new";
  return WORST_FIRST.find((s) => states.includes(s)) ?? "new";
}

type Listed = { name: string; category: OrgCategory; openCount: number };

/** Organisations by category in `CATEGORY_ORDER`; within one, most open first, then by name. */
export function byCategory<T extends Listed>(
  orgs: readonly T[],
): { category: OrgCategory; orgs: T[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    orgs: orgs
      .filter((o) => o.category === category)
      .sort((a, b) => b.openCount - a.openCount || a.name.localeCompare(b.name, "en")),
  })).filter((g) => g.orgs.length > 0);
}

/** Where an organisation is based: its city in our list, else its country code. */
export function baseLabel(o: { city: string | null; country: string }): string {
  if (o.city) return findCity(o.city)?.name ?? o.city;
  return o.country === "NG" ? "Nigeria" : o.country;
}

/** The registry file an organisation is defined in ("Improve this entry"). */
export function registryPath(slug: string): string {
  return `registry/organizations/${slug}.yaml`;
}
