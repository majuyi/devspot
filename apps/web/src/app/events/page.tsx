import { findCity, type OpportunityDto } from "@devspot/schema";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ListEnding } from "@/components/blocks";
import { PlacePill } from "@/components/filters";
import { BandHeader } from "@/components/headers";
import { RowList } from "@/components/row-list";
import { OpportunityRow } from "@/components/rows";
import { InvalidCursor } from "@/data/cursor";
import { countEvents, eventCountsByCity, listEvents } from "@/data/events";
import { calendarHref, eventDayLabel, eventsHref, parseCalendarParams } from "@/ui/calendar";
import { watDay } from "@/ui/time";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const cityName = (slug: string) => findCity(slug)?.name ?? slug;

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const p = parseCalendarParams(sp, new Date());
  return {
    title: p.city ? `Events in ${cityName(p.city)}` : "Events",
    description: "Upcoming tech events in Nigeria and online, by start date.",
    alternates: { canonical: eventsHref({ city: p.city, tags: p.tags }) },
    robots: sp.cursor ? { index: false, follow: true } : undefined,
  };
}

/**
 * `/events` list view (docs/01 §3): upcoming events by start, a band per day. Like browse,
 * the URL is the whole state and every control is a link. The map view is M4.
 */
export default async function Events({ searchParams }: Props) {
  const sp = await searchParams;
  const now = new Date();
  const p = parseCalendarParams(sp, now);
  const cursor = (Array.isArray(sp.cursor) ? sp.cursor[0] : sp.cursor) || undefined;
  const filters = { city: p.city, tags: p.tags.length ? p.tags : undefined };

  const [list, total, places] = await Promise.all([
    listEvents({ ...filters, cursor }, { now }).catch((e: unknown) => {
      if (e instanceof InvalidCursor) return null;
      throw e;
    }),
    countEvents(filters, { now }),
    eventCountsByCity({ now }),
  ]);
  if (!list) redirect(eventsHref({ city: p.city, tags: p.tags }));

  const serverNow = now.toISOString();
  const today = watDay(now);
  // An event that started before today is under way; those share one band.
  const dayOf = (o: OpportunityDto) => Math.max(today - 1, watDay(new Date(o.startsAt ?? now)));
  const cities =
    p.city && !places.some((c) => c.city === p.city)
      ? [{ city: p.city, count: 0 }, ...places]
      : places;
  let previous: number | undefined;

  return (
    <main className="mx-auto max-w-content md:px-2">
      <div className="max-w-[760px]">
        <div className="flex flex-col gap-1 px-4 pt-5 pb-3.5">
          <h1 className="text-page-title m-0">
            {p.city ? `Events in ${cityName(p.city)}` : "Events"}
          </h1>
          <p className="m-0 text-[13px] text-muted" aria-live="polite">
            {[
              ...(p.city ? ["With nationwide and online"] : []),
              ...(p.tags.length ? [`Tagged ${p.tags.join(", ")}`] : []),
              `${total.toLocaleString("en-GB")} upcoming`,
            ].join(" · ")}
          </p>
        </div>

        <nav
          aria-label="Places"
          className="flex gap-2 overflow-x-auto border-b border-line px-4 pb-3.5 [scrollbar-width:none]"
        >
          <PlacePill name="All places" href={eventsHref({ tags: p.tags })} selected={!p.city} />
          {cities.map((c) => (
            <PlacePill
              key={c.city}
              name={cityName(c.city)}
              count={c.count}
              href={eventsHref({ tags: p.tags, city: c.city === p.city ? undefined : c.city })}
              selected={c.city === p.city}
            />
          ))}
        </nav>

        {list.items.length ? (
          <>
            <p className="m-0 px-4 py-3 text-[13px] text-muted">Sorted by starting soonest</p>
            <RowList>
              {list.items.map((item) => {
                const day = dayOf(item);
                const band = day === previous ? null : eventDayLabel(day, now);
                previous = day;
                return (
                  <div key={item.slug} className="contents">
                    {band ? (
                      <BandHeader
                        label={band.label}
                        tone={day - today <= 7 ? "amber" : "none"}
                        range={day < today ? undefined : band.date}
                      />
                    ) : null}
                    <OpportunityRow item={item} serverNow={serverNow} />
                  </div>
                );
              })}
              {list.nextCursor ? (
                <ListEnding
                  href={eventsHref({ city: p.city, tags: p.tags, cursor: list.nextCursor })}
                  strong
                >
                  Next page
                </ListEnding>
              ) : null}
            </RowList>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2.5 px-4 pt-9 pb-3">
              <h2 className="m-0 text-[18px] leading-6 font-semibold tracking-[-0.02em]">
                {p.city
                  ? `No upcoming events in ${cityName(p.city)} right now`
                  : "No upcoming events right now"}
              </h2>
              <p className="text-body m-0 text-muted">
                We read every source again within six hours. Anything new will appear here.
              </p>
            </div>
            <div className="mt-3">
              <RowList>
                {p.city || p.tags.length ? (
                  <ListEnding href={eventsHref()} strong>
                    Events in every place
                  </ListEnding>
                ) : (
                  <ListEnding href="/opportunities" strong>
                    Everything open
                  </ListEnding>
                )}
              </RowList>
            </div>
          </>
        )}

        <p className="m-0 px-4 pt-4 pb-8 text-[12px] text-faint">
          {list.items.length
            ? `Showing ${list.items.length >= total ? `all ${total}` : `${cursor ? "the next " : ""}${list.items.length} of ${total}`}. `
            : null}
          <Link
            href={calendarHref({ kinds: ["event"], city: p.city, tags: p.tags }, now, "#subscribe")}
            className="underline underline-offset-2"
          >
            Get these in your calendar
          </Link>
          {cursor ? (
            <>
              {" · "}
              <Link
                href={eventsHref({ city: p.city, tags: p.tags })}
                className="underline underline-offset-2"
              >
                Back to the first page
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </main>
  );
}
