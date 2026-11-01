import type { SourceHealth } from "./api.js";

export const ERRORING_AFTER = 3;
export const STALE_AFTER_EMPTY = 8;
export const NEW_UNDER_RUNS = 4;

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
