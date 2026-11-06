import { z } from "zod";
import { CitySlug } from "./cities.js";
import { OpportunityKind, OrgCategory, SourceKind } from "./enums.js";
import { OpportunityDto } from "./opportunity.js";

const csv = <T extends z.ZodType<string, string>>(item: T) =>
  z
    .string()
    .transform((s): string[] =>
      s
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(item))
    .optional();

export const ApiListParams = z.object({
  q: z.string().max(200).optional(),
  kinds: csv(OpportunityKind).meta({ description: "Comma-separated kinds, e.g. job,internship" }),
  city: CitySlug.optional(),
  country: z.string().length(2).optional(),
  remote: z.enum(["1"]).optional(),
  tags: csv(z.string()).meta({ description: "Comma-separated tags; any one matches" }),
  org: z.string().optional(),
  status: z.enum(["published", "closed", "all"]).default("published"),
  closingWithin: z.coerce.number().int().min(1).max(365).optional(),
  updatedSince: z.iso.datetime().optional(),
  sort: z.enum(["deadline", "new", "updated"]).default("deadline"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});
export type ApiListParams = z.infer<typeof ApiListParams>;

/** A date (midnight in Lagos) or a datetime, as `from` and `to` on `/api/v1/events`. */
const DateOrDatetime = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

export const EventListParams = z.object({
  city: CitySlug.optional(),
  from: DateOrDatetime.optional(),
  to: DateOrDatetime.optional(),
  tags: csv(z.string()).meta({ description: "Comma-separated tags; any one matches" }),
  limit: ApiListParams.shape.limit,
  cursor: z.string().optional(),
});
export type EventListParams = z.infer<typeof EventListParams>;

export const OrganizationListParams = z.object({
  category: OrgCategory.optional(),
  country: z.string().length(2).optional(),
  city: CitySlug.optional(),
  limit: ApiListParams.shape.limit,
  cursor: z.string().optional(),
});
export type OrganizationListParams = z.infer<typeof OrganizationListParams>;

export const OrganizationOpportunitiesParams = ApiListParams.pick({
  status: true,
  limit: true,
  cursor: true,
});

export const SourceHealth = z.enum(["healthy", "stale", "erroring", "new", "disabled"]);
export type SourceHealth = z.infer<typeof SourceHealth>;

export const OrganizationDto = z.object({
  slug: z.string(),
  name: z.string(),
  url: z.url(),
  category: OrgCategory,
  homepageUrl: z.url(),
  description: z.string().nullable(),
  country: z.string(),
  city: z.string().nullable(),
  logoUrl: z.url().nullable(),
  openCount: z.number().int(),
  sources: z.array(
    z.object({
      key: z.string(),
      kind: SourceKind,
      url: z.url(),
      health: SourceHealth,
      lastOkAt: z.iso.datetime().nullable(),
    }),
  ),
});
export type OrganizationDto = z.infer<typeof OrganizationDto>;

export const ApiError = z.object({
  error: z.object({
    code: z.enum(["bad_request", "not_found", "rate_limited", "internal"]),
    message: z.string(),
  }),
});

export const OpportunityPage = z.object({
  items: z.array(OpportunityDto),
  nextCursor: z.string().nullable(),
});

export const OrganizationPage = z.object({
  items: z.array(OrganizationDto),
  nextCursor: z.string().nullable(),
});

export const MetaDto = z.object({
  version: z.literal("1"),
  generatedAt: z.iso.datetime(),
  counts: z.object({
    organizations: z.number().int(),
    sources: z.number().int(),
    openOpportunities: z.number().int(),
  }),
  lastEngineRunAt: z.iso.datetime().nullable(),
  cities: z.array(z.object({ slug: CitySlug, name: z.string(), state: z.string() })),
  kinds: z.array(OpportunityKind),
  tags: z.array(z.string()),
});
export type MetaDto = z.infer<typeof MetaDto>;
