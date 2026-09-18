import { z } from "zod";
import { CitySlug } from "./cities.js";
import {
  DeadlineKind,
  DiscoveredVia,
  ExtractionMethod,
  LocationMode,
  OpportunityKind,
  OpportunityStatus,
} from "./enums.js";
import { CountryCode } from "./organization.js";

const Confidence = z.number().min(0).max(1);
const IsoDate = z.iso.datetime();

/**
 * The output of the extract stage, for one RawItem. Everything optional except title and
 * canonicalUrl. Every field carries a confidence; every filled field should carry evidence.
 * This is also the structured-output schema for LLM extraction.
 */
export const OpportunityDraft = z.object({
  isOpportunity: z.boolean().default(true),
  title: z.string().min(3).max(300),
  canonicalUrl: z.url(),
  applyUrl: z.url().optional(),
  kind: OpportunityKind.optional(),
  summary: z.string().max(280).optional(),
  opensAt: IsoDate.optional(),
  deadlineAt: IsoDate.optional(),
  deadlineKind: DeadlineKind.default("unknown"),
  deadlineTimezone: z.string().optional(),
  startsAt: IsoDate.optional(),
  endsAt: IsoDate.optional(),
  locationMode: LocationMode.optional(),
  country: CountryCode.optional(),
  city: CitySlug.optional(),
  venueName: z.string().max(200).optional(),
  venueAddress: z.string().max(300).optional(),
  regionsTags: z.array(z.string()).default([]),
  requirementsText: z.string().max(4000).optional(),
  tags: z.array(z.string()).default([]),
  fieldConfidence: z.record(z.string(), Confidence).default({}),
  evidence: z.array(z.object({ field: z.string(), quote: z.string().min(1) })).default([]),
});
export type OpportunityDraft = z.infer<typeof OpportunityDraft>;

/** What the loader accepts. Required fields are enforced here, not in the draft. */
export const OpportunityInput = OpportunityDraft.omit({
  isOpportunity: true,
  evidence: true,
}).extend({
  organizationId: z.string(),
  rawItemId: z.string().optional(),
  submissionId: z.string().optional(),
  kind: OpportunityKind,
  locationMode: LocationMode,
  confidence: Confidence,
  extractionMethod: ExtractionMethod,
  discoveredVia: DiscoveredVia,
  extracted: z.unknown().optional(),
});
export type OpportunityInput = z.infer<typeof OpportunityInput>;

/** Public DTO. Never includes confidence, extracted, identityKey or raw ids. */
export const OpportunityDto = z.object({
  id: z.string(),
  slug: z.string(),
  url: z.url(),
  title: z.string(),
  kind: OpportunityKind,
  summary: z.string().nullable(),
  organization: z.object({ slug: z.string(), name: z.string(), url: z.url() }),
  canonicalUrl: z.url(),
  applyUrl: z.url().nullable(),
  opensAt: IsoDate.nullable(),
  deadlineAt: IsoDate.nullable(),
  deadlineKind: DeadlineKind,
  deadlineTimezone: z.string().nullable(),
  startsAt: IsoDate.nullable(),
  endsAt: IsoDate.nullable(),
  locationMode: LocationMode,
  country: z.string().nullable(),
  city: z.string().nullable(),
  venue: z
    .object({
      name: z.string().nullable(),
      address: z.string().nullable(),
      lat: z.number().nullable(),
      lng: z.number().nullable(),
    })
    .nullable(),
  regionsTags: z.array(z.string()),
  tags: z.array(z.string()),
  requirementsText: z.string().nullable(),
  status: OpportunityStatus.extract(["published", "closed"]),
  firstSeenAt: IsoDate,
  publishedAt: IsoDate.nullable(),
  lastVerifiedAt: IsoDate.nullable(),
  closedAt: IsoDate.nullable(),
});
export type OpportunityDto = z.infer<typeof OpportunityDto>;

export const PUBLISH_THRESHOLD = 0.8;
export const RULES_ONLY_PUBLISH_THRESHOLD = 0.75;

/** Words that must never appear in machine-written summaries. See docs/05 §2. */
export const ELIGIBILITY_WORDS = ["eligible", "qualify", "qualifies", "open to you"] as const;
