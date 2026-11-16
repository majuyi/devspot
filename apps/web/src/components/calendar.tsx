import type { Route } from "next";
import Link from "next/link";
import { type Cell, type DayItems, dayDate, dayKey, relativeDay } from "@/ui/calendar";
import { FAMILY_TINT, KIND_FAMILY } from "@/ui/kind";
import { placeLabel } from "@/ui/place";
import { formatDate, hasStatedTime, time, watDay } from "@/ui/time";
import { target, tone } from "@/ui/urgency";
import { KindTag } from "./kind-tag";
import type { RowItem } from "./rows";
import { StatusWord } from "./status-word";

const DOT = { red: "bg-red", amber: "bg-amber", none: "bg-faint", closed: "bg-faint" };
const TIME = { red: "text-red", amber: "text-amber", none: "text-fg", closed: "text-faint" };
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The word and clock for an item's moment. Once it has passed (an open item not yet
 * re-checked, or an event under way) the word is in the past tense.
 */
function when(o: RowItem, now: Date) {
  const t = target(o);
  if (!t) return null;
  const past = t.at.getTime() <= now.getTime();
  const verb = t.mode === "start" ? (past ? "Started" : "Starts") : past ? "Closed" : "Closes";
  return { verb, clock: hasStatedTime(t.at) ? time(t.at) : null };
}

/**
 * A row of the phone agenda (board "Calendar · mobile"): the time, or "No time" when the
 * source gave only a date, then kind, Closes or Starts, title, who and where.
 */
function AgendaRow({ item, now }: { item: RowItem; now: Date }) {
  const w = when(item, now);
  const urgency = tone(item, now);
  return (
    <Link
      href={`/o/${item.slug}` as Route}
      prefetch={false}
      className="flex gap-3 border-t border-line px-4 py-[13px] no-underline hover:bg-raise"
    >
      <span
        className={`text-date w-[52px] shrink-0 pt-0.5 leading-[18px] font-medium ${
          w?.clock ? `text-[14px] ${TIME[urgency]}` : "text-[11px] text-faint"
        }`}
      >
        {w?.clock ?? "No time"}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center justify-between gap-2">
          <KindTag kind={item.kind} />
          {w ? <StatusWord tone={urgency}>{w.verb}</StatusWord> : null}
        </span>
        <span className="text-row-title text-pretty">{item.title}</span>
        <span className="text-meta text-muted">
          {item.organization.name} · {placeLabel(item)}
        </span>
      </span>
    </Link>
  );
}

function DayBand({ day, now }: { day: number; now: Date }) {
  return (
    <div
      data-band=""
      className="flex items-center justify-between border-t border-line bg-raise px-4 py-[7px] text-[12px] font-semibold"
    >
      <span className="text-date text-fg">{formatDate(dayDate(day), { year: false })}</span>
      <span className="font-normal text-muted">{relativeDay(day, now)}</span>
    </div>
  );
}

/**
 * The month as a list of days that have something, for a phone. Today always shows when it
 * is in the month, so an empty day reads as empty and not as missing.
 */
export function CalendarAgenda({
  days,
  now,
  showToday,
}: {
  days: DayItems<RowItem>[];
  now: Date;
  showToday: boolean;
}) {
  const today = watDay(now);
  const listed =
    showToday && !days.some((d) => d.day === today)
      ? [...days, { day: today, items: [] }].sort((a, b) => a.day - b.day)
      : days;
  if (listed.length === 0) {
    return (
      <p className="m-0 border-y border-line px-4 py-3.5 text-[13px] text-faint">
        Nothing closes or starts this month yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col border-b border-line">
      {listed.map((d) => (
        <section key={d.day} aria-label={formatDate(dayDate(d.day))} className="contents">
          <DayBand day={d.day} now={now} />
          {d.items.length ? (
            d.items.map((item) => <AgendaRow key={item.slug} item={item} now={now} />)
          ) : (
            <p className="m-0 border-t border-line px-4 py-3.5 text-[13px] text-faint">
              Nothing closes or starts today.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * The month grid (board "Calendar · desktop month", docs/07 §5): a table of weeks, Monday
 * first. Each item is a link in its day's cell, tinted by kind family, with a dot coloured
 * by urgency and the time when the source gave one. A busy day's cell grows.
 */
export function CalendarGrid({
  weeks,
  days,
  now,
  caption,
}: {
  weeks: Cell[][];
  days: DayItems<RowItem>[];
  now: Date;
  caption: string;
}) {
  const today = watDay(now);
  const items = new Map(days.map((d) => [d.day, d.items]));
  return (
    <table className="w-full table-fixed border-collapse border-t border-l border-line">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {WEEKDAYS.map((d) => (
            <th
              key={d}
              scope="col"
              className="border-r border-b border-line px-2.5 py-2 text-left text-[12px] font-medium text-muted"
            >
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]?.day}>
            {week.map((cell) => (
              <td
                key={cell.day}
                className={`h-[112px] border-r border-b border-line p-2 align-top ${cell.inMonth ? "" : "bg-surface"}`}
              >
                <div className="flex flex-col gap-1">
                  <time
                    dateTime={dayKey(cell.day)}
                    className={`text-date flex h-6 min-w-6 items-center justify-center self-end rounded-full px-1.5 text-[12px] font-medium ${
                      cell.day === today ? "bg-fg text-bg" : cell.inMonth ? "text-fg" : "text-faint"
                    }`}
                  >
                    {new Date(cell.day * 86_400_000).getUTCDate()}
                    {cell.day === today ? <span className="sr-only"> (today)</span> : null}
                  </time>
                  {(cell.inMonth ? (items.get(cell.day) ?? []) : []).map((item) => {
                    const w = when(item, now);
                    return (
                      <Link
                        key={item.slug}
                        href={`/o/${item.slug}` as Route}
                        prefetch={false}
                        title={item.title}
                        className={`flex min-w-0 items-center gap-1.5 rounded-tag px-[7px] py-1 text-[12px] leading-4 font-[550] no-underline hover:underline ${FAMILY_TINT[KIND_FAMILY[item.kind]]}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`size-1.5 shrink-0 rounded-full ${DOT[tone(item, now)]}`}
                        />
                        <span className="sr-only">{w?.verb} </span>
                        {w?.clock ? (
                          <span className="text-date shrink-0 text-[12px] font-normal">
                            {w.clock}
                          </span>
                        ) : null}
                        <span className="truncate">{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
