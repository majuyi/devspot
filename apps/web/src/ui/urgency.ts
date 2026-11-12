import type { DeadlineKind, OpportunityKind } from "@devspot/schema";
import { DAY, HOUR } from "@/data/time";
import { daysBetween, formatDate, hasStatedTime, time, weekday } from "./time";

/** docs/07 §3: red within 48 hours or today, amber within 7 days, otherwise neutral. */
export type Tone = "red" | "amber" | "none" | "closed";

export type Countdown = { main: string; sub?: string };

/** The fields the time-dependent parts of a row read. */
export type Timed = {
  kind: OpportunityKind;
  status: "published" | "closed";
  deadlineAt: string | null;
  deadlineKind: DeadlineKind;
  startsAt: string | null;
};

/** The instant a row counts down to: the start for events, the deadline otherwise. */
export function target(o: Timed): { at: Date; mode: "deadline" | "start" } | null {
  if (o.kind === "event") return o.startsAt ? { at: new Date(o.startsAt), mode: "start" } : null;
  return o.deadlineAt && o.deadlineKind !== "rolling" && o.deadlineKind !== "unknown"
    ? { at: new Date(o.deadlineAt), mode: "deadline" }
    : null;
}

/** docs/07 §6. Null once the instant has passed. */
export function countdown(
  at: Date,
  now: Date,
  mode: "deadline" | "start" = "deadline",
): Countdown | null {
  const ms = at.getTime() - now.getTime();
  const days = daysBetween(now, at);
  if (mode === "start") {
    // Events count whole calendar days: a date with no time has no hours to show.
    if (days < 0) return null;
    if (days === 0) return { main: "Today" };
    return days > 99 ? { main: `${Math.floor(days / 30)}mo` } : { main: `${days}d` };
  }
  if (ms <= 0) return null;
  if (days === 0 && !hasStatedTime(at)) return { main: "Today" };
  if (ms < HOUR) return { main: `${Math.max(1, Math.floor(ms / 60_000))}m` };
  if (ms < 48 * HOUR) {
    return { main: `${Math.floor(ms / HOUR)}h`, sub: `${Math.floor((ms % HOUR) / 60_000)}m` };
  }
  const d = Math.floor(ms / DAY);
  if (d > 99) return { main: `${Math.floor(d / 30)}mo` };
  return { main: `${d}d`, sub: `${Math.floor((ms % DAY) / HOUR)}h` };
}

export function tone(o: Timed, now: Date): Tone {
  if (o.status === "closed") return "closed";
  const t = target(o);
  if (!t) return "none";
  const ms = t.at.getTime() - now.getTime();
  if (ms <= 0 && t.mode === "deadline") return "closed";
  if (t.mode === "start") return daysBetween(now, t.at) <= 7 && ms > -DAY ? "amber" : "none";
  if (ms < 48 * HOUR || daysBetween(now, t.at) === 0) return "red";
  return ms < 7 * DAY ? "amber" : "none";
}

/** The status word beside the kind tag (docs/07 §5). Null when the row shows no word. */
export function statusWord(o: Timed, now: Date): string | null {
  if (o.status === "closed") return "Closed";
  if (o.kind !== "event" && o.deadlineKind === "rolling") return "Rolling applications";
  const t = target(o);
  if (!t) return null;
  const days = daysBetween(now, t.at);
  if (t.mode === "start") {
    if (days < 0) return null;
    if (days === 0) return "Starts today";
    return days <= 7 ? `Starts ${weekday(t.at)}` : "Scheduled";
  }
  if (t.at.getTime() <= now.getTime()) return "Closed";
  if (days === 0) return hasStatedTime(t.at) ? `Closes today, ${time(t.at)}` : "Closes today";
  if (days === 1) return "Closes tomorrow";
  return days <= 7 ? `Closes ${weekday(t.at)}` : "Open";
}

export type Group = "today" | "tomorrow" | "week" | "later";

export const GROUP_LABEL: Record<Group, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  week: "This week",
  later: "Later",
};

export const GROUP_TONE: Record<Group, Tone> = {
  today: "red",
  tomorrow: "red",
  week: "amber",
  later: "none",
};

export function groupOf(at: Date, now: Date): Group {
  const days = daysBetween(now, at);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return days <= 7 ? "week" : "later";
}

/** The mono range on a group header: a date, `to Wed 11 Nov`, or `from Thu 12 Nov`. */
export function groupRange(group: Group, now: Date): string {
  const day = (n: number) => new Date(now.getTime() + n * DAY);
  switch (group) {
    case "today":
      return formatDate(now);
    case "tomorrow":
      return formatDate(day(1));
    case "week":
      return `to ${formatDate(day(7), { year: false })}`;
    case "later":
      return `from ${formatDate(day(8), { year: false })}`;
  }
}
