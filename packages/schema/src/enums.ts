import { z } from "zod";

// Every enum here is mirrored in packages/db/prisma/schema.prisma.
// packages/db/test/enum-parity.test.ts asserts the two sets are identical.

export const OrgCategory = z.enum([
  "employer",
  "ossProgram",
  "fellowshipFunder",
  "scholarshipFunder",
  "hackathonHost",
  "community",
  "trainingProvider",
  "accelerator",
  "government",
  "university",
]);
export type OrgCategory = z.infer<typeof OrgCategory>;

export const SourceKind = z.enum(["feed", "sitemap", "html", "api", "manual"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const Cadence = z.enum(["rolling", "monthly", "quarterly", "annual", "unpredictable"]);
export type Cadence = z.infer<typeof Cadence>;

export const OpportunityKind = z.enum([
  "internship",
  "job",
  "fellowship",
  "scholarship",
  "grant",
  "hackathon",
  "ossProgram",
  "event",
  "competition",
  "accelerator",
  "bootcamp",
]);
export type OpportunityKind = z.infer<typeof OpportunityKind>;

export const DeadlineKind = z.enum(["fixed", "rolling", "multiRound", "unknown"]);
export type DeadlineKind = z.infer<typeof DeadlineKind>;

export const LocationMode = z.enum(["remote", "onsite", "hybrid"]);
export type LocationMode = z.infer<typeof LocationMode>;

export const OpportunityStatus = z.enum(["review", "published", "closed", "rejected"]);
export type OpportunityStatus = z.infer<typeof OpportunityStatus>;

export const DiscoveredVia = z.enum([
  "feed",
  "sitemap",
  "html",
  "api",
  "submission",
  "whatsapp",
  "manual",
]);
export type DiscoveredVia = z.infer<typeof DiscoveredVia>;

export const ExtractionMethod = z.enum(["rules", "llm", "manual"]);
export type ExtractionMethod = z.infer<typeof ExtractionMethod>;

export const SubmissionChannel = z.enum(["web", "whatsapp", "manual"]);
export type SubmissionChannel = z.infer<typeof SubmissionChannel>;

export const SubmissionStatus = z.enum(["new", "merged", "rejected", "duplicate"]);
export type SubmissionStatus = z.infer<typeof SubmissionStatus>;

export const KIND_LABELS: Record<OpportunityKind, string> = {
  internship: "Internship",
  job: "Job",
  fellowship: "Fellowship",
  scholarship: "Scholarship",
  grant: "Grant",
  hackathon: "Hackathon",
  ossProgram: "Open-source programme",
  event: "Event",
  competition: "Competition",
  accelerator: "Accelerator",
  bootcamp: "Bootcamp",
};
