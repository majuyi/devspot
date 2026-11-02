import { ADAPTERS } from "./adapters/index.js";
import { canonicalizeUrl } from "./dedupe.js";
import { extractRules } from "./extract/rules.js";
import { type FetchFn, fetchSource } from "./fetch.js";
import { applyItemFilter } from "./filter.js";
import type { HttpClient } from "./http.js";
import { log as jsonLog } from "./log.js";
import { loadRegistrySources, type RegistrySource, UnknownSource } from "./registry.js";

export type SourceFilter = { source?: string; org?: string; limit?: number };

export type RunnableSource = Pick<RegistrySource, "key" | "organizationSlug" | "adapter">;

/** Filters by flags. A filter that matches nothing is a typo, so it fails loudly. */
export function selectSources<T extends RunnableSource>(sources: T[], filter: SourceFilter): T[] {
  const picked = sources.filter(
    (s) =>
      (!filter.source || s.key === filter.source) &&
      (!filter.org || s.organizationSlug === filter.org),
  );
  const asked = filter.source ?? filter.org;
  if (asked && !picked.length) throw new UnknownSource(asked);
  return picked;
}

/**
 * An adapter the registry names but nobody has written yet is unfinished work, not a broken
 * source: running it would fail the job on every run from the third on.
 */
export const hasFetcher = (s: RunnableSource) => !s.adapter || ADAPTERS.has(s.adapter);

/** `--dry-run`: fetch and extract, print the drafts, touch no database. */
export async function dryRun({
  http,
  fetch = fetchSource,
  now = new Date(),
  log = jsonLog,
  sources = loadRegistrySources(),
  ...filter
}: SourceFilter & {
  http: HttpClient;
  fetch?: FetchFn;
  now?: Date;
  log?: typeof jsonLog;
  sources?: RegistrySource[];
}): Promise<{ sources: number; drafts: number; errors: number }> {
  const picked = selectSources(
    sources.filter((s) => s.enabled),
    filter,
  );
  const result = { sources: 0, drafts: 0, errors: 0 };
  for (const source of picked) {
    if (!hasFetcher(source)) {
      log("source.skipped", { source: source.key, reason: "adapter not written" });
      continue;
    }
    result.sources++;
    try {
      const fetched = await fetch(source, http);
      const { kept: items, dropped } = applyItemFilter(fetched.items, source.filter);
      if (dropped) log("source.filtered", { source: source.key, dropped, kept: items.length });
      for (const item of items.slice(0, filter.limit)) {
        const { draft, confidence } = extractRules({
          item: {
            title: item.title ?? null,
            text: item.text,
            canonicalUrl: canonicalizeUrl(item.url),
            publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
            meta: item.meta,
          },
          org: source.organization,
          now,
        });
        log("draft", { source: source.key, confidence, draft });
        result.drafts++;
      }
    } catch (error) {
      result.errors++;
      log("source.failed", {
        source: source.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
