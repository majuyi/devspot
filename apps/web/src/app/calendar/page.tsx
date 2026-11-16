import type { Metadata } from "next";
import Link from "next/link";
import { ListEnding } from "@/components/blocks";
import { CalendarAgenda, CalendarGrid } from "@/components/calendar";
import { KindChip } from "@/components/filters";
import { CalendarAddIcon } from "@/components/icons";
import { calendarItems } from "@/data/calendar";
import { siteUrl } from "@/data/site";
import {
  addMonths,
  byDay,
  type CalendarParams,
  calendarHref,
  currentMonth,
  feedPath,
  filterLabel,
  MONTHS_AHEAD,
  monthLabel,
  monthRange,
  monthSummary,
  monthWeeks,
  parseCalendarParams,
  sameMonth,
} from "@/ui/calendar";
import { FAMILIES, familyOf, kindsOf } from "@/ui/kind";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const now = new Date();
  const p = parseCalendarParams(await searchParams, now);
  return {
    title: `Calendar · ${monthLabel(p.month)}`,
    description: "Deadlines and event dates for the month, in West Africa Time.",
    alternates: { canonical: calendarHref(p, now) },
  };
}

function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={back ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

const NAV = "flex size-target items-center justify-center rounded-pill no-underline hover:bg-raise";

/**
 * `/calendar`, boards "Calendar · mobile" and "Calendar · desktop month" (docs/01 §3). The
 * month, kinds and city are in the URL and every control is a link, so navigation needs no
 * JavaScript. A phone gets the month as a list; from 1024px it is a grid.
 */
export default async function Calendar({ searchParams }: Props) {
  const now = new Date();
  const p = parseCalendarParams(await searchParams, now);
  const current = currentMonth(now);
  const isCurrent = sameMonth(p.month, current);
  const items = await calendarItems({
    ...monthRange(p.month),
    kinds: p.kinds,
    city: p.city,
    tags: p.tags,
  });
  const days = byDay(items);
  const label = monthLabel(p.month);
  const family = familyOf(p.kinds);
  const filters: Omit<CalendarParams, "month"> = { kinds: p.kinds, city: p.city, tags: p.tags };
  const previous = isCurrent ? null : addMonths(p.month, -1);
  const next = sameMonth(p.month, addMonths(current, MONTHS_AHEAD)) ? null : addMonths(p.month, 1);
  const feed = feedPath(filters);
  const feedUrl = `${siteUrl()}${feed}`;
  const what = filterLabel(p.kinds);

  return (
    <main className="mx-auto max-w-content md:px-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3.5 pr-2 pl-4 lg:pt-6">
        <h1 className="text-page-title m-0 grow lg:grow-0">{label}</h1>
        <nav aria-label="Months" className="flex items-center lg:grow">
          {previous ? (
            <Link
              href={calendarHref({ ...filters, month: previous }, now)}
              aria-label={monthLabel(previous)}
              className={NAV}
            >
              <Chevron back />
            </Link>
          ) : null}
          {next ? (
            <Link
              href={calendarHref({ ...filters, month: next }, now)}
              aria-label={monthLabel(next)}
              className={NAV}
            >
              <Chevron />
            </Link>
          ) : null}
          {isCurrent ? null : (
            <Link
              href={calendarHref(filters, now)}
              className="ml-1 flex h-target items-center rounded-pill border border-line px-3.5 text-[13px] font-medium no-underline hover:bg-raise"
            >
              Today
            </Link>
          )}
        </nav>
      </div>

      <div className="flex items-center justify-between gap-3 px-4 pb-3 text-[13px] text-muted">
        <span>
          {what ? `${what} · ` : ""}
          {monthSummary(items)}
        </span>
        <a
          href="#subscribe"
          className="flex min-h-target items-center gap-1.5 font-medium text-fg no-underline hover:underline"
        >
          <CalendarAddIcon />
          Subscribe
        </a>
      </div>

      <nav
        aria-label="Kinds"
        className="flex gap-2 overflow-x-auto px-4 pb-3.5 [scrollbar-width:none]"
      >
        <KindChip
          family="all"
          href={calendarHref({ ...filters, kinds: [], month: p.month }, now)}
          selected={p.kinds.length === 0}
        />
        {FAMILIES.map((f) => (
          <KindChip
            key={f}
            family={f}
            href={calendarHref(
              { ...filters, kinds: f === family ? [] : kindsOf(f), month: p.month },
              now,
            )}
            selected={f === family}
          />
        ))}
      </nav>

      <div className="lg:hidden">
        <CalendarAgenda days={days} now={now} showToday={isCurrent} />
      </div>
      <div className="hidden px-4 lg:block">
        <CalendarGrid
          weeks={monthWeeks(p.month)}
          days={days}
          now={now}
          caption={`${label}: deadlines and event starts`}
        />
      </div>

      {next ? (
        <div className="lg:hidden">
          <ListEnding href={calendarHref({ ...filters, month: next }, now)} strong>
            {monthLabel(next)}
          </ListEnding>
        </div>
      ) : null}

      <p className="m-0 max-w-[68ch] px-4 pt-4 text-[12px] leading-[17px] text-faint">
        Only items with a stated date are here: deadlines on the day they close, events on the day
        they start. Rolling applications and items with no stated deadline are on the{" "}
        <Link href="/opportunities" className="underline underline-offset-2">
          opportunities page
        </Link>
        . All times in West Africa Time.
      </p>

      <section
        id="subscribe"
        aria-labelledby="subscribe-title"
        className="flex max-w-[68ch] flex-col gap-2 px-4 pt-8 pb-10"
      >
        <h2 id="subscribe-title" className="text-section m-0">
          Subscribe
        </h2>
        <p className="text-body m-0 text-muted">
          Add {what ? `${what.toLowerCase()} ` : ""}deadlines and event dates to your own calendar.
          It updates by itself as we read the sources. Copy this address into your calendar app's
          "subscribe" or "add by URL" option:
        </p>
        <code className="text-date block rounded-tile border border-line bg-surface px-3 py-2.5 text-[13px] break-all select-all">
          {feedUrl}
        </code>
        <div className="flex flex-wrap gap-x-5">
          <a
            href={feedUrl.replace(/^https?:/, "webcal:")}
            className="flex min-h-target items-center text-[14px] font-medium underline underline-offset-[3px]"
          >
            Open in your calendar app
          </a>
          <a
            href={feed}
            className="flex min-h-target items-center text-[14px] text-muted underline underline-offset-[3px]"
          >
            Download once
          </a>
        </div>
      </section>
    </main>
  );
}
