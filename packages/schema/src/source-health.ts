import type { SourceHealth } from "./api.js";

// Counted in runs at the two-hourly schedule (docs/04 §1 stage 7): 9 failures is about 18
// hours, 24 empty runs two days, 12 runs a day. GitHub starts fewer runs than scheduled, so in
// practice each takes about twice as long, which is what the six-hourly 3, 8 and 4 gave.
export const ERRORING_AFTER = 9;
export const STALE_AFTER_EMPTY = 24;
export const NEW_UNDER_RUNS = 12;

/**
 * State of a source, computed and never stored (docs/04 §1 stage 7). Worst first, so a source
 * failing from its first run is `erroring`, not `new`. In the engine for the run summary and
 * in the web app for `/status`, hence here.
 */
export function sourceHealth(
  source: {
    enabled: boolean;
    consecutiveErrors: number;
    consecutiveEmpty: number;
    baselineWeeklyYield: number | null;
  },
  runs: number,
): SourceHealth {
  if (!source.enabled) return "disabled";
  if (source.consecutiveErrors >= ERRORING_AFTER) return "erroring";
  if (runs < NEW_UNDER_RUNS) return "new";
  if (source.consecutiveEmpty >= STALE_AFTER_EMPTY && (source.baselineWeeklyYield ?? 0) > 1)
    return "stale";
  return "healthy";
}
