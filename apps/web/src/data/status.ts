import { db } from "@devspot/db";
import { type SourceHealth, sourceHealth } from "@devspot/schema";
import { OPEN } from "./dto";
import { addMs, DAY, HOUR } from "./time";

const WORST_FIRST: SourceHealth[] = ["erroring", "stale", "new", "healthy", "disabled"];

/**
 * `/status` (docs/01 §3). Source states are computed exactly as `engine health` computes them,
 * so the page and the CLI agree.
 */
export async function getStatus({ now = new Date() } = {}) {
  const [lastRun, organizations, openOpportunities, publishedThisWeek, sources] = await Promise.all(
    [
      db.fetchRun.findFirst({
        where: { finishedAt: { not: null } },
        orderBy: { finishedAt: "desc" },
        select: { finishedAt: true },
      }),
      db.organization.count({ where: { enabled: true } }),
      db.opportunity.count({ where: OPEN }),
      db.opportunity.count({ where: { ...OPEN, publishedAt: { gte: addMs(now, -7 * DAY) } } }),
      db.source.findMany({
        include: {
          organization: { select: { slug: true, name: true, enabled: true } },
          _count: { select: { fetchRuns: true } },
        },
        orderBy: { key: "asc" },
      }),
    ],
  );
  const rows = sources
    .map((s) => ({
      key: s.key,
      kind: s.kind,
      url: s.url,
      organization: { slug: s.organization.slug, name: s.organization.name },
      health: sourceHealth(
        { ...s, enabled: s.enabled && s.organization.enabled },
        s._count.fetchRuns,
      ),
      lastOkAt: s.lastOkAt?.toISOString() ?? null,
      lastYieldAt: s.lastYieldAt?.toISOString() ?? null,
      consecutiveEmpty: s.consecutiveEmpty,
      consecutiveErrors: s.consecutiveErrors,
    }))
    .sort((a, b) => WORST_FIRST.indexOf(a.health) - WORST_FIRST.indexOf(b.health));
  const enabled = rows.filter((r) => r.health !== "disabled").length;
  return {
    lastEngineRunAt: lastRun?.finishedAt?.toISOString() ?? null,
    counts: { organizations, sources: enabled, openOpportunities, publishedThisWeek },
    sources: rows,
  };
}

/**
 * The line under "Closing soon": how many enabled sources were read without error in the
 * last day, and, when that is all of them, the hours since the one read longest ago.
 */
export async function sourceFreshness({ now = new Date() } = {}) {
  const sources = await db.source.findMany({
    where: { enabled: true, organization: { enabled: true } },
    select: { lastOkAt: true },
  });
  const since = addMs(now, -DAY).getTime();
  const read = sources.flatMap((s) =>
    s.lastOkAt && s.lastOkAt.getTime() >= since ? [s.lastOkAt.getTime()] : [],
  );
  const all = sources.length > 0 && read.length === sources.length;
  const oldest = Math.min(...read);
  return {
    total: sources.length,
    read: read.length,
    withinHours: all ? Math.max(1, Math.ceil((now.getTime() - oldest) / HOUR)) : 24,
  };
}
