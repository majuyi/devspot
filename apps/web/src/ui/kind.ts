import type { OpportunityKind } from "@devspot/schema";

export type Family = "work" | "build" | "events" | "funding" | "prog";

/** docs/07 §3: five families, the exact kind as the tag's word. */
export const KIND_FAMILY: Record<OpportunityKind, Family> = {
  job: "work",
  internship: "work",
  hackathon: "build",
  competition: "build",
  event: "events",
  scholarship: "funding",
  grant: "funding",
  fellowship: "funding",
  bootcamp: "prog",
  ossProgram: "prog",
  accelerator: "prog",
};

export const KIND_LABEL: Record<OpportunityKind, string> = {
  job: "Job",
  internship: "Internship",
  hackathon: "Hackathon",
  competition: "Competition",
  event: "Event",
  scholarship: "Scholarship",
  grant: "Grant",
  fellowship: "Fellowship",
  bootcamp: "Bootcamp",
  ossProgram: "Open-source programme",
  accelerator: "Accelerator",
};

export const FAMILY_LABEL: Record<Family, string> = {
  work: "Work",
  build: "Build",
  events: "Events",
  funding: "Funding",
  prog: "Programmes",
};

export const FAMILIES = Object.keys(FAMILY_LABEL) as Family[];

export function kindsOf(family: Family): OpportunityKind[] {
  return (Object.keys(KIND_FAMILY) as OpportunityKind[]).filter((k) => KIND_FAMILY[k] === family);
}

// Literal class names so Tailwind's scanner generates them.
export const FAMILY_TINT: Record<Family, string> = {
  work: "bg-k-work-bg text-k-work-fg",
  build: "bg-k-build-bg text-k-build-fg",
  events: "bg-k-events-bg text-k-events-fg",
  funding: "bg-k-funding-bg text-k-funding-fg",
  prog: "bg-k-prog-bg text-k-prog-fg",
};

/** Selected chip: the family's text colour as ground (board "Components", kind filter). */
export const FAMILY_SELECTED: Record<Family, string> = {
  work: "bg-k-work-fg text-bg",
  build: "bg-k-build-fg text-bg",
  events: "bg-k-events-fg text-bg",
  funding: "bg-k-funding-fg text-bg",
  prog: "bg-k-prog-fg text-bg",
};
