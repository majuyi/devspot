import { NEW_UNDER_RUNS, type SourceHealth } from "@devspot/schema";

/** Runs a week at the six-hour cadence, to scale one run's yield to a week. */
const RUNS_PER_WEEK = 28;

export type SourceCounters = {
  consecutiveEmpty: number;
  consecutiveErrors: number;
  baselineWeeklyYield: number | null;
};

export type RunResult = {
  ok: boolean;
  nNew: number;
  finishedAt: Date;
  /** Runs recorded for this source, this one included. */
  runs: number;
};

export type SourceHealthUpdate = SourceCounters & {
  lastRunAt: Date;
  lastOkAt?: Date;
  lastYieldAt?: Date;
};

/**
 * Stage 7 (docs/04 §1): the counters to write to `Source` after a run. A failed run leaves the
 * baseline alone: it says nothing about what the source publishes.
 */
export function health(source: SourceCounters, run: RunResult): SourceHealthUpdate {
  const weekly = run.nNew * RUNS_PER_WEEK;
  const previous = source.baselineWeeklyYield;
  const baselineWeeklyYield =
    run.ok && run.runs >= NEW_UNDER_RUNS
      ? previous === null
        ? weekly
        : 0.8 * previous + 0.2 * weekly
      : previous;
  return {
    consecutiveErrors: run.ok ? 0 : source.consecutiveErrors + 1,
    consecutiveEmpty: run.nNew > 0 ? 0 : source.consecutiveEmpty + 1,
    baselineWeeklyYield,
    lastRunAt: run.finishedAt,
    ...(run.ok ? { lastOkAt: run.finishedAt } : {}),
    ...(run.nNew > 0 ? { lastYieldAt: run.finishedAt } : {}),
  };
}

export type SourceRun = {
  key: string;
  ok: boolean;
  nNew: number;
  nChanged: number;
  published: number;
  review: number;
  health: SourceHealth;
};

export type RunSummary = {
  run: string;
  sources: number;
  ok: number;
  errors: number;
  new: number;
  changed: number;
  published: number;
  review: number;
  stale: string[];
  erroring: string[];
};

/** The JSON summary line of a run (docs/04 §6). */
export function runSummary(run: string, sources: readonly SourceRun[]): RunSummary {
  const sum = (pick: (s: SourceRun) => number) => sources.reduce((n, s) => n + pick(s), 0);
  const inState = (state: SourceHealth) =>
    sources.filter((s) => s.health === state).map((s) => s.key);
  return {
    run,
    sources: sources.length,
    ok: sources.filter((s) => s.ok).length,
    errors: sources.filter((s) => !s.ok).length,
    new: sum((s) => s.nNew),
    changed: sum((s) => s.nChanged),
    published: sum((s) => s.published),
    review: sum((s) => s.review),
    stale: inState("stale"),
    erroring: inState("erroring"),
  };
}
