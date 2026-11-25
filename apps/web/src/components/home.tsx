import { type CitySlug, findCity } from "@devspot/schema";
import type { Route } from "next";
import Link from "next/link";
import { startingSoon } from "@/data/events";
import {
  closingSoon,
  deadlineCounts,
  inNigeria,
  nearYou,
  newThisWeek,
  type OpenPlace,
  openPlaces,
} from "@/data/opportunities";
import { sourceFreshness } from "@/data/status";
import { browseHref } from "@/ui/browse";
import { freshnessLine } from "@/ui/freshness";
import { FAMILIES, kindsOf } from "@/ui/kind";
import { placeTone } from "@/ui/map";
import { ListEnding } from "./blocks";
import { KindChip, PlacePill, StatusFigure } from "./filters";
import { SectionHeader } from "./headers";
import { NigeriaMap } from "./nigeria-map";
import { GroupedRows, RowList, Rows } from "./row-list";

const count = (n: number) => n.toLocaleString("en-GB");

/**
 * Home, board "D · Map band + board" (docs/01 §3). `city` chooses the "Near you" section and
 * its pill, nothing else: the other sections are the same for every reader, so the page
 * stays cached. On a phone the band is on top with the rest as a sheet over it; from 1024px
 * it is a card at the top of the right column (board "Home · desktop").
 */
export async function Home({ city }: { city?: CitySlug }) {
  const now = new Date();
  const serverNow = now.toISOString();
  // Events already in "In Nigeria" are not repeated under "Starting soon".
  const nigeria = inNigeria({ now });
  const [local, closing, counts, events, fresh, freshness, places, near] = await Promise.all([
    nigeria,
    closingSoon({ now }),
    deadlineCounts({ now }),
    nigeria.then((n) => startingSoon({ now, exclude: n.items.map((o) => o.id) })),
    newThisWeek({ now }),
    sourceFreshness({ now }),
    openPlaces({ now }),
    city ? nearYou(city) : null,
  ]);
  const read = freshnessLine(freshness);
  const moreOpen = counts.open - closing.length;
  const cityName = city ? (findCity(city)?.name ?? city) : null;

  return (
    <main className="mx-auto max-w-content pb-2 md:px-2">
      <h1 className="sr-only">Opportunities for early-career tech people in Nigeria</h1>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:gap-x-10 lg:pt-6">
        <Band counts={counts} places={places} city={city} now={now} />

        <div className="relative -mt-[18px] rounded-t-sheet border-t border-line bg-bg lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:rounded-none lg:border-t-0">
          <nav
            aria-label="Kinds"
            className="flex gap-2 overflow-x-auto border-b border-line px-4 pt-4 pb-3.5 [scrollbar-width:none] lg:flex-wrap lg:pt-0"
          >
            <KindChip family="all" href="/opportunities" selected />
            {FAMILIES.map((f) => (
              <KindChip key={f} family={f} href={browseHref({ kinds: kindsOf(f) })} />
            ))}
          </nav>

          {local.items.length ? (
            <section aria-labelledby="in-nigeria">
              <SectionHeader id="in-nigeria" title="In Nigeria" />
              <RowList>
                <Rows items={local.items} serverNow={serverNow} />
              </RowList>
            </section>
          ) : null}

          <section aria-labelledby="closing-soon">
            <SectionHeader
              id="closing-soon"
              title="Closing soon"
              link={{ href: "/opportunities", label: `All ${count(counts.open)} open` }}
              // /status arrives in M2.9; the cast goes then.
              note={
                read ? (
                  <>
                    {read}{" "}
                    <Link href={"/status" as Route} className="underline underline-offset-2">
                      Status
                    </Link>
                  </>
                ) : null
              }
            />
            {closing.length ? (
              <RowList>
                <GroupedRows items={closing} serverNow={serverNow} />
                {moreOpen > 0 ? (
                  <ListEnding href="/opportunities">{count(moreOpen)} more open</ListEnding>
                ) : null}
              </RowList>
            ) : (
              <Quiet>
                Nothing with a stated deadline is open right now.{" "}
                {counts.open > 0 ? (
                  <Link href="/opportunities" className="underline underline-offset-2">
                    See all {count(counts.open)} open
                  </Link>
                ) : null}
              </Quiet>
            )}
          </section>

          {events.items.length ? (
            <section aria-labelledby="starting-soon">
              <SectionHeader
                id="starting-soon"
                title="Starting soon"
                // /events arrives in M2.7; the cast inside SectionHeader covers it.
                link={{
                  href: "/events",
                  label: events.total === 1 ? "The 1 event" : `All ${count(events.total)} events`,
                }}
              />
              <RowList>
                <GroupedRows items={events.items} serverNow={serverNow} by="start" />
              </RowList>
            </section>
          ) : null}
        </div>

        <div className="lg:col-start-2 lg:row-start-2">
          {fresh.length ? (
            <section aria-labelledby="new-this-week">
              <SectionHeader
                id="new-this-week"
                title="New this week"
                link={{ href: browseHref({ sort: "new" }), label: "See all" }}
              />
              <RowList>
                <Rows items={fresh} serverNow={serverNow} />
              </RowList>
            </section>
          ) : null}

          <section aria-labelledby="near-you">
            {city && near ? (
              <>
                <SectionHeader
                  id="near-you"
                  title={
                    <>
                      Near you <span className="font-medium text-muted">· {cityName}</span>
                    </>
                  }
                  link={{ href: "#places", label: "Change city" }}
                />
                {near.items.length ? (
                  <RowList>
                    <Rows items={near.items} serverNow={serverNow} />
                    {near.total > near.items.length ? (
                      <ListEnding href={browseHref({ city })} strong>
                        {count(near.total - near.items.length)} more in {cityName}
                      </ListEnding>
                    ) : null}
                  </RowList>
                ) : (
                  <Quiet>
                    Nothing open in {cityName} right now.{" "}
                    <Link
                      href={browseHref({ remote: true })}
                      className="underline underline-offset-2"
                    >
                      See what is remote
                    </Link>
                  </Quiet>
                )}
              </>
            ) : (
              <>
                <SectionHeader id="near-you" title="Near you" />
                <Quiet>
                  Pick a place in the row under the map to see what is happening there. Remote items
                  are listed for everyone.
                </Quiet>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-body m-0 px-4 pb-2 text-muted">{children}</p>;
}

/** The band on `sea`: the map, three figures and the place pills (docs/01 §3). */
function Band({
  counts,
  places,
  city,
  now,
}: {
  counts: { open: number; within7Days: number; within48Hours: number };
  places: { remote: OpenPlace; cities: (OpenPlace & { city: string })[] };
  city?: CitySlug;
  now: Date;
}) {
  const cities = places.cities.map((p) => ({ ...p, tone: placeTone(p, now) }));
  // A chosen city with nothing open still gets its pill, to show what is selected.
  const pills =
    city && !cities.some((p) => p.city === city)
      ? [{ city, count: 0, tone: "none" as const }, ...cities]
      : cities;
  return (
    <section
      aria-label="Where and when"
      className="flex flex-col gap-3 bg-sea px-4 pt-3.5 pb-8 lg:col-start-2 lg:row-start-1 lg:gap-4 lg:self-start lg:rounded-sheet lg:p-5"
    >
      <div className="flex items-center gap-3.5 lg:flex-col lg:items-stretch lg:gap-4">
        <NigeriaMap
          places={cities}
          className="h-[146px] w-[164px] shrink-0 lg:order-2 lg:h-auto lg:w-full lg:max-w-[320px] lg:self-center"
        />
        <div className="flex flex-1 flex-col gap-2.5 lg:order-1 lg:grid lg:grid-cols-3">
          <StatusFigure value={counts.open} label="open" tone="none" href="/opportunities" />
          <StatusFigure
            value={counts.within7Days}
            label="closing this week"
            tone="amber"
            href={browseHref({ closing: 7 })}
          />
          <StatusFigure
            value={counts.within48Hours}
            label="in 48 hours"
            tone="red"
            href={browseHref({ closing: 2 })}
          />
        </div>
      </div>
      <nav
        id="places"
        aria-label="Places"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:px-0"
      >
        {/* Remote is not a city, so it has no "Near you": its pill goes to the list. */}
        <PlacePill
          name="Remote"
          count={places.remote.count}
          tone={placeTone(places.remote, now)}
          href={browseHref({ remote: true })}
        />
        {pills.map((p) => (
          <PlacePill
            key={p.city}
            name={findCity(p.city)?.name ?? p.city}
            count={p.count}
            tone={p.tone}
            // "all" and not "/": a reader with a saved city would be sent straight back to it.
            href={p.city === city ? "/?city=all" : `/?city=${p.city}`}
            selected={p.city === city}
          />
        ))}
      </nav>
    </section>
  );
}
