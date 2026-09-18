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

export const SourceYaml = z
  .object({
    name: Slug,
    kind: SourceKind,
    url: z.url(),
    adapter: Slug.optional(),
    cadence: Cadence.default("unpredictable"),
    include: z.string().optional(), // sitemap glob
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
