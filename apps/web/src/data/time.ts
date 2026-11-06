export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** West Africa Time is UTC+1 all year (no daylight saving), so a day starts at 23:00 UTC. */
const WAT_OFFSET = HOUR;

/** Midnight in Lagos at the start of the day that contains `now`, as a UTC instant. */
export function startOfDayWat(now: Date): Date {
  const shifted = now.getTime() + WAT_OFFSET;
  return new Date(shifted - (shifted % DAY) - WAT_OFFSET);
}

export const addMs = (d: Date, ms: number) => new Date(d.getTime() + ms);
