import { CitySlug, OpportunityKind } from "@devspot/schema";
import type { Route } from "next";
import { DAY, HOUR } from "@/data/time";
import { FAMILY_LABEL, familyOf, kindList } from "./kind";
import { formatDate, watDay } from "./time";
import { type Timed, target } from "./urgency";

/** A calendar month: `month` is 1 to 12. */
export type Month = { year: number; month: number };

/** How far ahead the calendar goes (docs/01 §3). */
export const MONTHS_AHEAD = 18;

const index = (m: Month) => m.year * 12 + (m.month - 1);
const fromIndex = (i: number): Month => ({ year: Math.floor(i / 12), month: (i % 12) + 1 });

/** The month in Lagos that contains `now`. */
export function currentMonth(now: Date): Month {
  const d = new Date(now.getTime() + HOUR);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

export const monthKey = (m: Month) => `${m.year}-${String(m.month).padStart(2, "0")}`;
export const addMonths = (m: Month, n: number) => fromIndex(index(m) + n);
export const sameMonth = (a: Month, b: Month) => index(a) === index(b);

/**
 * `?month=2026-10`. Anything else, a month already past, or one beyond the range gives the
 * current month: nothing open lies in the past, and a page never fails on a mistyped month.
 */
export function parseMonth(value: string | undefined, now: Date): Month {
  const current = currentMonth(now);
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!m) return current;
  const month = { year: Number(m[1]), month: Number(m[2]) };
  if (month.month < 1 || month.month > 12) return current;
  const ahead = index(month) - index(current);
  return ahead < 0 || ahead > MONTHS_AHEAD ? current : month;
}

const MONTH_NAME = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

/** "November 2026". */
export function monthLabel(m: Month): string {
  return `${MONTH_NAME.format(Date.UTC(m.year, m.month - 1, 1))} ${m.year}`;
}

/** The month's first instant in Lagos, and the next month's. */
export function monthRange(m: Month): { from: Date; to: Date } {
  const next = addMonths(m, 1);
  return {
    from: new Date(Date.UTC(m.year, m.month - 1, 1) - HOUR),
    to: new Date(Date.UTC(next.year, next.month - 1, 1) - HOUR),
  };
}

/** A day in Lagos as `2026-11-04`, from the day number `watDay` gives. */
export function dayKey(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

/** Noon in Lagos on that day: a safe instant to format the day from. */
export const dayDate = (day: number) => new Date(day * DAY + 11 * HOUR);

/** "Today", "Tomorrow", "In 3 days"; nothing for a day already past. */
export function relativeDay(day: number, now: Date): string {
  const n = day - watDay(now);
  if (n < 0) return "";
  if (n === 0) return "Today";
  return n === 1 ? "Tomorrow" : `In ${n} days`;
}

/** The day an item sits on: its deadline's, or for an event its start's. */
export function itemDay(o: Timed): number | null {
  const t = target(o);
  return t ? watDay(t.at) : null;
}

export type DayItems<T extends Timed = Timed> = { day: number; items: T[] };

/** Items under the day each sits on, days in order. Undated items are dropped. */
export function byDay<T extends Timed>(items: readonly T[]): DayItems<T>[] {
  const days = new Map<number, T[]>();
  for (const o of items) {
    const day = itemDay(o);
    if (day === null) continue;
    days.set(day, [...(days.get(day) ?? []), o]);
  }
  return [...days.entries()].sort(([a], [b]) => a - b).map(([day, list]) => ({ day, items: list }));
}

export type Cell = { day: number; inMonth: boolean };

/** The grid's weeks, Monday first, covering the month and padded with its neighbours' days. */
export function monthWeeks(m: Month): Cell[][] {
  const first = Date.UTC(m.year, m.month - 1, 1) / DAY;
  const next = addMonths(m, 1);
  const last = Date.UTC(next.year, next.month - 1, 1) / DAY - 1;
  // Day 0 of the epoch was a Thursday; (day + 3) % 7 is 0 on a Monday.
  const start = first - ((first + 3) % 7);
  const weeks: Cell[][] = [];
  for (let d = start; d <= last; d += 7) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => ({
        day: d + i,
        inMonth: d + i >= first && d + i <= last,
      })),
    );
  }
  return weeks;
}

/** "4 deadlines · 5 events", leaving out a part that is zero; "Nothing dated" for neither. */
export function monthSummary(items: readonly Timed[]): string {
  const events = items.filter((o) => o.kind === "event").length;
  const deadlines = items.length - events;
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  const parts = [
    ...(deadlines ? [n(deadlines, "deadline")] : []),
    ...(events ? [n(events, "event")] : []),
  ];
  return parts.length ? parts.join(" · ") : "Nothing dated this month";
}

export type CalendarParams = {
  month: Month;
  kinds: OpportunityKind[];
  city?: CitySlug;
  tags: string[];
};

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || "";
const csv = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** The filters shared by `/calendar`, `/calendar.ics` and `/events`; lenient, as on browse. */
export function parseCalendarParams(sp: Search, now: Date): CalendarParams {
  const kinds = csv(first(sp.kinds)).filter(
    (k): k is OpportunityKind => OpportunityKind.safeParse(k).success,
  );
  const city = CitySlug.safeParse(first(sp.city));
  return {
    month: parseMonth(first(sp.month) || undefined, now),
    kinds: [...new Set(kinds)],
    city: city.success ? city.data : undefined,
    tags: csv(first(sp.tags)),
  };
}

function query(p: Partial<Omit<CalendarParams, "month">>, extra: string[] = []): string {
  const parts = [...extra];
  if (p.kinds?.length) parts.push(`kinds=${p.kinds.map(encodeURIComponent).join(",")}`);
  if (p.city) parts.push(`city=${encodeURIComponent(p.city)}`);
  if (p.tags?.length) parts.push(`tags=${p.tags.map(encodeURIComponent).join(",")}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** `/calendar?month=2026-12&kinds=…`; the current month is the bare address. */
export function calendarHref(
  p: Partial<CalendarParams> & { month?: Month },
  now: Date,
  hash = "",
): Route {
  const month =
    p.month && !sameMonth(p.month, currentMonth(now)) ? [`month=${monthKey(p.month)}`] : [];
  return `/calendar${query(p, month)}${hash}` as Route;
}

/** The feed for the same filters, as a path. */
export function feedPath(p: Partial<Omit<CalendarParams, "month">>): string {
  return `/calendar.ics${query(p)}`;
}

/** `/events?city=lagos`. */
export function eventsHref(p: { city?: CitySlug; tags?: string[]; cursor?: string } = {}): Route {
  const extra = p.cursor ? [`cursor=${encodeURIComponent(p.cursor)}`] : [];
  const q = query({ city: p.city, tags: p.tags });
  const rest = extra.length ? `${q ? `${q}&` : "?"}${extra.join("&")}` : q;
  return `/events${rest}` as Route;
}

/** What a filtered calendar or feed holds, for a heading or a feed's name. */
export function filterLabel(kinds: readonly OpportunityKind[]): string | null {
  if (!kinds.length) return null;
  const family = familyOf(kinds);
  return family ? FAMILY_LABEL[family] : kindList(kinds);
}

/** The band over a day of events: "Under way" for one that started before today. */
export function eventDayLabel(day: number, now: Date): { label: string; date: string } {
  const before = day < watDay(now);
  return {
    label: before ? "Under way" : relativeDay(day, now),
    date: formatDate(dayDate(day)),
  };
}
