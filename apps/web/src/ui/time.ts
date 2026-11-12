import { DAY, HOUR } from "@/data/time";

/** Lagos is UTC+1 all year, so its calendar day is the UTC day of `t + 1h`. */
export function watDay(d: Date): number {
  return Math.floor((d.getTime() + HOUR) / DAY);
}

/** Whole calendar days in Lagos from `now` to `d` (0 today, 1 tomorrow, negative past). */
export function daysBetween(now: Date, d: Date): number {
  return watDay(d) - watDay(now);
}

const PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parts(d: Date): Record<string, string> {
  return Object.fromEntries(PARTS.formatToParts(d).map((p) => [p.type, p.value]));
}

/**
 * A date-only deadline is stored as 23:59 in Lagos (docs/05 §1), so 23:59 means the source
 * gave no time. A source that said 23:59 loses nothing by showing the date alone.
 */
export function hasStatedTime(d: Date): boolean {
  const p = parts(d);
  return !(p.hour === "23" && p.minute === "59");
}

export function weekday(d: Date): string {
  return parts(d).weekday as string;
}

export function time(d: Date): string {
  const p = parts(d);
  return `${p.hour}:${p.minute}`;
}

/** `Fri 3 Oct 2026`, or `Fri 3 Oct 2026, 04:45 WAT` when a time is given and wanted. */
export function formatDate(d: Date, opts: { time?: boolean; year?: boolean } = {}): string {
  const p = parts(d);
  const date = [p.weekday, p.day, p.month, opts.year === false ? undefined : p.year]
    .filter(Boolean)
    .join(" ");
  return opts.time && hasStatedTime(d) ? `${date}, ${p.hour}:${p.minute} WAT` : date;
}

/** "checked 2h ago" from `lastVerifiedAt`. */
export function checkedAgo(at: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - at.getTime());
  if (ms < 60_000) return "checked just now";
  if (ms < HOUR) return `checked ${Math.floor(ms / 60_000)}m ago`;
  if (ms < DAY) return `checked ${Math.floor(ms / HOUR)}h ago`;
  return `checked ${Math.floor(ms / DAY)}d ago`;
}

/** The host a reader will land on, without `www.`. */
export function sourceDomain(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}
