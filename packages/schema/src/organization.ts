import { z } from "zod";
import { CitySlug } from "./cities.js";
import { Cadence, OrgCategory, SourceKind } from "./enums.js";

export const Slug = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens");

export const CountryCode = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, uppercase");

/**
 * Which listed items a source keeps (docs/04 §1, "Item filter"). For job boards whose roles
 * are mostly outside the audience: software, data, design and product, 0 to 2 years.
 */
export const ItemFilter = z
  .object({
    /** Keep items whose `meta.department` is one of these, compared case-insensitively. */
    departments: z.array(z.string().min(1)).min(1).optional(),
    /**
     * Keep items whose title contains one of these as whole words, case-insensitively.
     * With `departments` too, an item is kept when either matches.
     */
    titles: z.array(z.string().min(1)).min(1).optional(),
    /**
     * Drop items whose `meta.country` (ISO alpha-2, set by the adapter) is not one of these.
     * Items with no stated country are kept: the adapter could not say.
     */
    countries: z.array(CountryCode).min(1).optional(),
    /** `early` drops senior titles unless the title also names an entry-level role. */
    seniority: z.enum(["early", "any"]).default("early"),
  })
  .strict();
export type ItemFilter = z.infer<typeof ItemFilter>;

export const SourceYaml = z
  .object({
    name: Slug,
    kind: SourceKind,
    url: z.url(),
    adapter: Slug.optional(),
    cadence: Cadence.default("unpredictable"),
    include: z.string().optional(), // sitemap glob
    filter: ItemFilter.optional(),
    enabled: z.boolean().default(true),
    notes: z.string().max(500).optional(),
  })
  .superRefine((s, ctx) => {
    if ((s.kind === "html" || s.kind === "api") && !s.adapter) {
      ctx.addIssue({
        code: "custom",
        path: ["adapter"],
        message: `${s.kind} sources need an adapter`,
      });
    }
    if (s.kind === "sitemap" && !s.include) {
      ctx.addIssue({
        code: "custom",
        path: ["include"],
        message: "sitemap sources need an include glob",
      });
    }
  });
export type SourceYaml = z.infer<typeof SourceYaml>;

export const OrganizationYaml = z.object({
  slug: Slug,
  name: z.string().min(2).max(120),
  category: OrgCategory,
  homepageUrl: z.url(),
  description: z.string().max(600).optional(),
  country: CountryCode,
  city: CitySlug.optional(),
  logoUrl: z.url().optional(),
  enabled: z.boolean().default(true),
  sources: z.array(SourceYaml).min(1),
});
export type OrganizationYaml = z.infer<typeof OrganizationYaml>;

/** Stable key for a source row: "<org-slug>/<source-name>". */
export function sourceKey(org: { slug: string }, source: { name: string }): string {
  return `${org.slug}/${source.name}`;
}
