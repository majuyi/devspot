const DAY = 24 * 3_600_000;

// Its own shape, not Pick<Opportunity>: only the database stages import @devspot/db.
export type DatedTarget = {
  kind: string | null;
  deadlineAt: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

/** The date after which an item is over. An event with one date is over when that day is. */
function lastDate({ kind, deadlineAt, startsAt, endsAt }: DatedTarget): Date | null {
  if (kind === "event") return endsAt ?? startsAt ?? deadlineAt;
  return deadlineAt ?? endsAt;
}

/**
 * Invariant 7 (docs/03 §4): more than 24 hours past its last date, an item is closed. The
 * loader applies it on the way in, so a listing already over is never published, and verify
 * applies it to published rows.
 */
export function isOver(target: DatedTarget, now: Date): boolean {
  const last = lastDate(target);
  return last !== null && now.getTime() - last.getTime() > DAY;
}
