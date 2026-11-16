import { type CitySlug, findCity } from "@devspot/schema";
import type { Route } from "next";
import Link from "next/link";
import { startingSoon } from "@/data/events";
import { closingSoon, deadlineCounts, nearYou, newThisWeek } from "@/data/opportunities";
import { sourceFreshness } from "@/data/status";
import { browseHref } from "@/ui/browse";
import { freshnessLine } from "@/ui/freshness";
import { FAMILIES, kindsOf } from "@/ui/kind";
import { ListEnding } from "./blocks";
import { KindChip } from "./filters";
import { SectionHeader } from "./headers";
import { GroupedRows, RowList, Rows } from "./row-list";

const count = (n: number) => n.toLocaleString("en-GB");

/**
 * Home, board "D · Map band + board" (docs/01 §3). `city` chooses the "Near you" section and
 * nothing else: the other sections are the same for every reader, so the page stays cached.
 * The map band above the kinds row is M2.4b.
 */
export async function Home({ city }: { city?: CitySlug }) {
  const now = new Date();
  const serverNow = now.toISOString();
  const [closing, counts, events, fresh, freshness, near] = await Promise.all([
    closingSoon({ now }),
    deadlineCounts({ now }),
    startingSoon({ now }),
    newThisWeek({ now }),
    sourceFreshness({ now }),
    city ? nearYou(city) : null,
  ]);
  const read = freshnessLine(freshness);
  const moreOpen = counts.open - closing.length;
  const cityName = city ? (findCity(city)?.name ?? city) : null;

  return (
    <main className="mx-auto max-w-content pb-2 md:px-2">
      <h1 className="sr-only">Opportunities for early-career tech people in Nigeria</h1>
      <nav
        aria-label="Kinds"
        className="flex gap-2 overflow-x-auto border-b border-line px-4 pt-4 pb-3.5 [scrollbar-width:none] lg:flex-wrap"
      >
        <KindChip family="all" href="/opportunities" selected />
        {FAMILIES.map((f) => (
          <KindChip key={f} family={f} href={browseHref({ kinds: kindsOf(f) })} />
        ))}
      </nav>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div>
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

        <div>
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
                  link={{ href: "/", label: "Change city" }}
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
                  Choose a city to see what is happening there. Remote items are listed for
                  everyone.
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
