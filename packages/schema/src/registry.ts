import { OrganizationYaml } from "./organization.js";

/**
 * One registry file after YAML parsing. Callers parse the YAML so this package keeps zod as
 * its only runtime dependency; a YAML syntax error arrives as `parseError`.
 */
export type RegistryFile = { file: string; raw?: unknown; parseError?: string };

/** One problem in one file, phrased for a contributor: which file, which field, what is wrong. */
export type RegistryIssue = { file: string; path: string; message: string };

export function formatRegistryIssue(issue: RegistryIssue): string {
  return `${issue.file}: ${issue.path}: ${issue.message}`;
}

export class RegistryValidationError extends Error {
  override readonly name = "RegistryValidationError";
  constructor(readonly issues: readonly RegistryIssue[]) {
    super(issues.map(formatRegistryIssue).join("\n"));
  }
}

export type RegistryOrganization = OrganizationYaml & { file: string };

/**
 * Validates every file and the set as a whole (slug matches file name, no duplicate slugs).
 * Shared by `registry:check` and `db:sync-registry` so both report the same messages.
 */
export function validateRegistry(files: readonly RegistryFile[]): {
  organizations: RegistryOrganization[];
  issues: RegistryIssue[];
} {
  const organizations: RegistryOrganization[] = [];
  const issues: RegistryIssue[] = [];
  const seen = new Set<string>();
  for (const { file, raw, parseError } of files) {
    if (parseError !== undefined) {
      issues.push({ file, path: "(yaml)", message: parseError });
      continue;
    }
    const result = OrganizationYaml.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues)
        issues.push({ file, path: issue.path.join(".") || "(root)", message: issue.message });
      continue;
    }
    const slug = result.data.slug;
    if (slug !== file.replace(/\.yaml$/, "")) {
      issues.push({ file, path: "slug", message: `"${slug}" must match the file name` });
      continue;
    }
    if (seen.has(slug)) {
      issues.push({ file, path: "slug", message: `duplicate slug "${slug}"` });
      continue;
    }
    seen.add(slug);
    organizations.push({ ...result.data, file });
  }
  return { organizations, issues };
}
