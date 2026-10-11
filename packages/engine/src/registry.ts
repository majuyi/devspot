import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
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

/**
 * Reads sources straight from the YAML, so `record` and `replay` work without a database.
 * The same validation as `pnpm registry:check`.
 */
export function loadRegistrySources(dir = REGISTRY_DIR): FetchSource[] {
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
    })),
  );
}

export function findSource(key: string, dir = REGISTRY_DIR): FetchSource {
  const source = loadRegistrySources(dir).find((s) => s.key === key);
  if (!source) throw new UnknownSource(key);
  return source;
}
