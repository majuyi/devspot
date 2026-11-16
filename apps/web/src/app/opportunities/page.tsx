import { findCity } from "@devspot/schema";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, ListEnding } from "@/components/blocks";
import { KindChip, PlacePill } from "@/components/filters";
import { GroupedRows, RowList, Rows } from "@/components/row-list";
import { SearchInput } from "@/components/search-input";
import { InvalidCursor } from "@/data/cursor";
import { countOpportunities, listOpportunities, openCountsByCity } from "@/data/opportunities";
import {
  type BrowseParams,
  browseHref,
  browseNotes,
  browseTitle,
  countLabel,
  emptyActions,
  emptyHeading,
  hasFilters,
  parseBrowseParams,
  type SearchParams,
  toFilters,
} from "@/ui/browse";
import { FAMILIES, familyOf, kindsOf } from "@/ui/kind";

type Props = { searchParams: Promise<SearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const p = parseBrowseParams(await searchParams);
  return {
    title: browseTitle(p),
    alternates: { canonical: browseHref({ ...p, cursor: undefined }) },
    // A later page is a slice of a list that moves; only the first page is worth indexing.
    robots: p.cursor ? { index: false, follow: true } : undefined,
  };
}

/**
 * Browse, board "Filtered list" (docs/01 §3). Every control is a link or a GET form, so the
 * URL is the whole state: it works without JavaScript and a pasted URL gives the same view.
 */
export default async function Opportunities({ searchParams }: Props) {
  const p = parseBrowseParams(await searchParams);
  const now = new Date();
  const serverNow = now.toISOString();
  const filters = toFilters(p);

  const [list, total, places] = await Promise.all([
    listOpportunities(filters, { now }).catch((e: unknown) => {
      if (e instanceof InvalidCursor) return null;
      throw e;
    }),
    countOpportunities(filters, { now }),
    openCountsByCity(),
  ]);
  // A cursor that does not decode (a mangled link): start the same list again.
  if (!list) redirect(browseHref({ ...p, cursor: undefined }));

  // Changing a filter starts the list again, so no link carries the cursor.
  const base: BrowseParams = { ...p, cursor: undefined };
  const family = familyOf(p.kinds);
  const eventsOnly = p.kinds.length > 0 && p.kinds.every((k) => k === "event");
  const notes = browseNotes(p);
  // A chosen city with nothing in it still needs its pill, to show what is selected.
  const cities =
    p.city && !places.cities.some((c) => c.city === p.city)
      ? [{ city: p.city, count: 0 }, ...places.cities]
      : places.cities;

  return (
    <main className="mx-auto max-w-content md:px-2">
      <div className="max-w-[760px]">
        <div className="flex flex-col gap-1 px-4 pt-5 pb-3.5">
          <h1 className="text-page-title m-0">{browseTitle(p)}</h1>
          <p className="m-0 text-[13px] text-muted" aria-live="polite">
            {[...notes, countLabel(total, p.closed)].join(" · ")}
            {hasFilters(p) ? (
              <>
                {" · "}
                <Link
                  href={browseHref({ sort: p.sort, closed: p.closed })}
                  className="underline underline-offset-2"
                >
                  Clear all
                </Link>
              </>
            ) : null}
          </p>
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: <search> is not yet in every reader's browser */}
        <form action="/opportunities" method="get" role="search" className="flex gap-2 px-4 pb-3">
          <label htmlFor="q" className="sr-only">
            Search opportunities
          </label>
          <SearchInput defaultValue={p.q} />
          {/* The other filters ride along, so a search narrows the current view. */}
          {p.kinds.length ? <input type="hidden" name="kinds" value={p.kinds.join(",")} /> : null}
          {p.city ? <input type="hidden" name="city" value={p.city} /> : null}
          {p.remote ? <input type="hidden" name="remote" value="1" /> : null}
          {p.tags.length ? <input type="hidden" name="tags" value={p.tags.join(",")} /> : null}
          {p.org ? <input type="hidden" name="org" value={p.org} /> : null}
          {p.closing ? <input type="hidden" name="closing" value={p.closing} /> : null}
          {p.sort === "new" ? <input type="hidden" name="sort" value="new" /> : null}
          {p.closed ? <input type="hidden" name="status" value="all" /> : null}
          <button type="submit" className={buttonClass("secondary")}>
            Search
          </button>
        </form>

        <nav
          aria-label="Kinds"
          className="flex gap-2 overflow-x-auto px-4 pb-2.5 [scrollbar-width:none]"
        >
          <KindChip
            family="all"
            href={browseHref({ ...base, kinds: [] })}
            selected={p.kinds.length === 0}
          />
          {FAMILIES.map((f) => (
            <KindChip
              key={f}
              family={f}
              // The selected chip's cross clears it.
              href={browseHref({ ...base, kinds: f === family ? [] : kindsOf(f) })}
              selected={f === family}
            />
          ))}
        </nav>
        <nav
          aria-label="Places"
          className="flex gap-2 overflow-x-auto border-b border-line px-4 pb-3.5 [scrollbar-width:none]"
        >
          <PlacePill
            name="All places"
            href={browseHref({ ...base, city: undefined, remote: false })}
            selected={!p.city && !p.remote}
          />
          <PlacePill
            name="Remote"
            count={places.remote}
            href={browseHref({ ...base, city: undefined, remote: !p.remote })}
            selected={p.remote}
          />
          {cities.map((c) => (
            <PlacePill
              key={c.city}
              name={findCity(c.city)?.name ?? c.city}
              count={c.count}
              href={browseHref({
                ...base,
                remote: false,
                city: c.city === p.city ? undefined : (c.city as BrowseParams["city"]),
              })}
              selected={c.city === p.city}
            />
          ))}
        </nav>

        {list.items.length ? (
          <>
            <p className="m-0 px-4 py-3 text-[13px] text-muted">
              {p.sort === "new"
                ? "Sorted by newest"
                : eventsOnly
                  ? "Sorted by starting soonest"
                  : "Sorted by closing soonest"}
            </p>
            <RowList>
              {p.sort === "new" ? (
                <Rows items={list.items} serverNow={serverNow} />
              ) : (
                <GroupedRows
                  items={list.items}
                  serverNow={serverNow}
                  by={eventsOnly ? "start" : "deadline"}
                />
              )}
              {list.nextCursor ? (
                <ListEnding href={browseHref({ ...p, cursor: list.nextCursor })} strong>
                  Next page
                </ListEnding>
              ) : null}
            </RowList>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2.5 px-4 pt-9 pb-3">
              <h2 className="m-0 text-[18px] leading-6 font-semibold tracking-[-0.02em]">
                {emptyHeading(p)}
              </h2>
              <p className="text-body m-0 text-muted">
                We read every source again within six hours. Anything new will appear here.
              </p>
            </div>
            <div className="mt-3">
              <RowList>
                {emptyActions(p).map((a) => (
                  <ListEnding key={a.href} href={a.href} strong>
                    {a.label}
                  </ListEnding>
                ))}
              </RowList>
            </div>
          </>
        )}

        <p className="m-0 px-4 pt-4 pb-8 text-[12px] text-faint">
          {list.items.length ? `${showing(list.items.length, total, Boolean(p.cursor))} ` : null}
          {p.closed ? "Closed items are shown. " : "Closed items are hidden. "}
          <Link
            href={browseHref({ ...base, closed: !p.closed })}
            className="underline underline-offset-2"
          >
            {p.closed ? "Hide closed" : "Show closed"}
          </Link>
          {p.cursor ? (
            <>
              {" · "}
              <Link href={browseHref(base)} className="underline underline-offset-2">
                Back to the first page
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </main>
  );
}

function showing(shown: number, total: number, later: boolean): string {
  if (shown >= total) return `Showing all ${total.toLocaleString("en-GB")}.`;
  return `Showing ${later ? "the next " : ""}${shown} of ${total.toLocaleString("en-GB")}.`;
}
