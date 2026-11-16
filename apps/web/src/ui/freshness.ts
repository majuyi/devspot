export type Freshness = { total: number; read: number; withinHours: number };

/** "All 23 sources read in the last 6 hours." Null with no sources: nothing true to say. */
export function freshnessLine(f: Freshness): string | null {
  if (f.total === 0) return null;
  const window = f.withinHours === 1 ? "hour" : `${f.withinHours} hours`;
  const noun = f.total === 1 ? "source" : "sources";
  if (f.read === f.total) {
    return f.total === 1
      ? `The one source was read in the last ${window}.`
      : `All ${f.total} ${noun} read in the last ${window}.`;
  }
  return `${f.read} of ${f.total} ${noun} read in the last ${window}.`;
}
