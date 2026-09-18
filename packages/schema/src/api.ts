import { z } from "zod";
import { CitySlug } from "./cities.js";
import { OpportunityKind, OrgCategory, SourceKind } from "./enums.js";

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
  kinds: csv(OpportunityKind),
  city: CitySlug.optional(),
  country: z.string().length(2).optional(),
  remote: z.enum(["1"]).optional(),
  tags: csv(z.string()),
  org: z.string().optional(),
  status: z.enum(["published", "closed", "all"]).default("published"),
  closingWithin: z.coerce.number().int().min(1).max(365).optional(),
  updatedSince: z.iso.datetime().optional(),
  sort: z.enum(["deadline", "new", "updated"]).default("deadline"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});
export type ApiListParams = z.infer<typeof ApiListParams>;

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
