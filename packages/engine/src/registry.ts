import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type OrgCategory,
  type RegistryFile,
  RegistryValidationError,
  sourceKey,
  validateRegistry,
} from "@devspot/schema";
import { parse } from "yaml";
import type { FetchSource } from "./fetch.js";

export const REGISTRY_DIR = resolve(import.meta.dirname, "../../../registry/organizations");

export class UnknownSource extends Error {
  override readonly name = "UnknownSource";
  constructor(readonly key: string) {
    super(`no source "${key}" in the registry (keys look like "hng/site")`);
  }
}

/** A source as the YAML has it, with what extraction needs to know of its organization. */
export type RegistrySource = FetchSource & {
  enabled: boolean;
  organization: { category: OrgCategory; country: string; city?: string };
};

/**
 * Reads sources straight from the YAML, so `record` and `replay` work without a database.
 * The same validation as `pnpm registry:check`.
 */
export function loadRegistrySources(dir = REGISTRY_DIR): RegistrySource[] {
  const files: RegistryFile[] = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") && !f.startsWith("_"))
    .map((file) => {
      try {
        return { file, raw: parse(readFileSync(resolve(dir, file), "utf8")) };
      } catch (e) {
        return { file, parseError: e instanceof Error ? e.message : String(e) };
      }
    });
  const { organizations, issues } = validateRegistry(files);
  if (issues.length) throw new RegistryValidationError(issues);
  return organizations.flatMap((org) =>
    org.sources.map((s) => ({
      key: sourceKey(org, s),
      organizationSlug: org.slug,
      kind: s.kind,
      url: s.url,
      ...(s.adapter ? { adapter: s.adapter } : {}),
      ...(s.include ? { include: s.include } : {}),
      enabled: org.enabled && s.enabled,
      organization: {
        category: org.category,
        country: org.country,
        ...(org.city ? { city: org.city } : {}),
      },
    })),
  );
}

export function findSource(key: string, dir = REGISTRY_DIR): RegistrySource {
  const source = loadRegistrySources(dir).find((s) => s.key === key);
  if (!source) throw new UnknownSource(key);
  return source;
}
