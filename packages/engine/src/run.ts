import { randomUUID } from "node:crypto";
import type { Organization, PrismaClient, Source } from "@devspot/db";
import { ERRORING_AFTER, sourceHealth } from "@devspot/schema";
import { hasFetcher, type SourceFilter, selectSources } from "./dry-run.js";
import { extractRules } from "./extract/rules.js";
import { type FetchFn, type FetchSource, fetchSource } from "./fetch.js";
import { health, type RunSummary, runSummary, type SourceRun } from "./health.js";
import { type HttpClient, HttpStatusError } from "./http.js";
import { load } from "./load.js";
import { log as jsonLog } from "./log.js";
import { upsertRawItems } from "./raw-items.js";
import { validateDraft } from "./validate.js";

type SourceRow = Source & { organization: Organization };

export type RunDeps = {
  db: PrismaClient;
  http: HttpClient;
  fetch?: FetchFn;
  now?: () => Date;
  log?: typeof jsonLog;
};

type RunContext = Required<RunDeps> & { limit?: number };

const asFetchSource = (row: SourceRow, knownUrls: ReadonlySet<string>): FetchSource => ({
  key: row.key,
  organizationSlug: row.organization.slug,
  kind: row.kind,
  url: row.url,
  ...(row.adapter ? { adapter: row.adapter } : {}),
  ...(row.include ? { include: row.include } : {}),
  ...(row.etag || row.lastModified
    ? {
        validators: {
          ...(row.etag ? { etag: row.etag } : {}),
          ...(row.lastModified ? { lastModified: row.lastModified } : {}),
        },
      }
    : {}),
  knownUrls,
});

/** Extract, validate and load what the dedupe stage let through. */
async function processFresh(
  row: SourceRow,
  fresh: Awaited<ReturnType<typeof upsertRawItems>>["fresh"],
  { db, now, log }: RunContext,
): Promise<Pick<SourceRun, "published" | "review">> {
  const counts = { published: 0, review: 0 };
  for (const { rawItem } of fresh) {
    const { organization: org } = row;
    const at = now();
    const { draft, confidence } = extractRules({ item: rawItem, org, now: at });
    const input = validateDraft(draft, {
      organizationId: org.id,
      rawItemId: rawItem.id,
      confidence,
      extractionMethod: "rules",
      discoveredVia: row.kind,
    });
    if (!input.success) {
      log("item.invalid", {
        source: row.key,
        url: rawItem.canonicalUrl,
        fields: input.error.issues.map((i) => i.path.join(".")),
      });
      continue;
    }
    const { status } = await load(input.data, {
      db,
      orgSlug: org.slug,
      now: at,
      firstSeenAt: rawItem.firstSeenAt,
    });
    if (status === "published") counts.published++;
    else if (status === "review") counts.review++;
  }
  return counts;
}

/** One source, start to finish. Never throws for anything the source did. */
async function runSource(
  row: SourceRow,
  ctx: RunContext,
): Promise<SourceRun & { turned: boolean }> {
  const { db, http, fetch, now, log, limit } = ctx;
  const startedAt = now();
  const outcome = { nFound: 0, nNew: 0, nChanged: 0, published: 0, review: 0 };
  let error: string | undefined;
  let httpStatus: number | undefined;
  let ok = true;
  let validators: FetchSource["validators"];

  try {
    const known = await db.rawItem.findMany({
      where: { sourceId: row.id },
      select: { canonicalUrl: true },
    });
    const result = await fetch(asFetchSource(row, new Set(known.map((r) => r.canonicalUrl))), http);
    httpStatus = result.httpStatus;
    validators = result.validators;
    // A partial fetch still counts as a run that worked; the note goes on the FetchRun.
    error = result.error;
    // Cut before dedupe: a stored item is never looked at again unless its page changes.
    const { found, fresh } = await upsertRawItems(
      db,
      row.id,
      result.items.slice(0, limit),
      startedAt,
    );
    outcome.nFound = found;
    outcome.nNew = fresh.filter((f) => f.status === "new").length;
    outcome.nChanged = fresh.length - outcome.nNew;
    Object.assign(outcome, await processFresh(row, fresh, ctx));
  } catch (e) {
    ok = false;
    error = e instanceof Error ? e.message : String(e);
    if (e instanceof HttpStatusError) httpStatus = e.status;
  }

  const finishedAt = now();
  await db.fetchRun.create({
    data: {
      sourceId: row.id,
      startedAt,
      finishedAt,
      ok,
      nFound: outcome.nFound,
      nNew: outcome.nNew,
      nChanged: outcome.nChanged,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      ...(httpStatus !== undefined ? { httpStatus } : {}),
      ...(error ? { error } : {}),
    },
  });
  const runs = await db.fetchRun.count({ where: { sourceId: row.id } });
  const update = health(row, { ok, nNew: outcome.nNew, finishedAt, runs });
  await db.source.update({
    where: { id: row.id },
    data: {
      ...update,
      ...(validators
        ? { etag: validators.etag ?? null, lastModified: validators.lastModified ?? null }
        : {}),
    },
  });

  const state = sourceHealth({ ...row, ...update }, runs);
  log("source.finished", { source: row.key, ok, ...outcome, error, health: state });
  return {
    key: row.key,
    ok,
    nNew: outcome.nNew,
    nChanged: outcome.nChanged,
    published: outcome.published,
    review: outcome.review,
    health: state,
    turned: row.consecutiveErrors < ERRORING_AFTER && update.consecutiveErrors >= ERRORING_AFTER,
  };
}

/** `engine run`. One failing source never stops the others. */
export async function runEngine({
  fetch = fetchSource,
  now = () => new Date(),
  log = jsonLog,
  source,
  org,
  limit,
  ...deps
}: RunDeps & SourceFilter): Promise<{ summary: RunSummary; turnedErroring: string[] }> {
  const rows = await deps.db.source.findMany({
    where: { enabled: true, organization: { enabled: true } },
    include: { organization: true },
    orderBy: { key: "asc" },
  });
  const picked = selectSources(
    rows.map((r) => ({
      ...r,
      organizationSlug: r.organization.slug,
      adapter: r.adapter ?? undefined,
    })),
    { ...(source ? { source } : {}), ...(org ? { org } : {}) },
  );
  const ctx: RunContext = { ...deps, fetch, now, log, ...(limit ? { limit } : {}) };
  const results: Awaited<ReturnType<typeof runSource>>[] = [];
  for (const row of picked) {
    if (!hasFetcher(row)) {
      log("source.skipped", { source: row.key, reason: "adapter not written" });
      continue;
    }
    if (row.kind === "manual") continue;
    results.push(await runSource({ ...row, adapter: row.adapter ?? null }, ctx));
  }
  const summary = runSummary(randomUUID(), results);
  log("run.finished", { ...summary });
  return { summary, turnedErroring: results.filter((r) => r.turned).map((r) => r.key) };
}

/** `engine health`: every source's state, worst first. */
export async function sourceStates(db: PrismaClient) {
  const rows = await db.source.findMany({
    include: {
      organization: { select: { enabled: true } },
      _count: { select: { fetchRuns: true } },
    },
    orderBy: { key: "asc" },
  });
  const order = ["erroring", "stale", "new", "healthy", "disabled"];
  return rows
    .map((s) => ({
      key: s.key,
      health: sourceHealth(
        { ...s, enabled: s.enabled && s.organization.enabled },
        s._count.fetchRuns,
      ),
      consecutiveErrors: s.consecutiveErrors,
      consecutiveEmpty: s.consecutiveEmpty,
      lastOkAt: s.lastOkAt,
      lastYieldAt: s.lastYieldAt,
    }))
    .sort((a, b) => order.indexOf(a.health) - order.indexOf(b.health));
}
