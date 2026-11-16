import { decodePreferences, PREFS_COOKIE } from "@devspot/schema";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, ListEnding } from "@/components/blocks";
import { BandHeader } from "@/components/headers";
import { PrefsForm } from "@/components/prefs-form";
import { RowList } from "@/components/row-list";
import { OpportunityRow } from "@/components/rows";
import { InvalidCursor } from "@/data/cursor";
import { feed } from "@/data/feed";
import { siteUrl } from "@/data/site";
import { DAY } from "@/data/time";
import {
  EMPTY_PREFS,
  feedHref,
  isEmptyPrefs,
  prefsFromSearch,
  prefsQuery,
  prefsSummary,
} from "@/ui/prefs";

export const metadata: Metadata = {
  title: "My feed",
  description: "Opportunities matched to the kinds, city and topics you choose.",
  // A page that differs for every reader has nothing to index.
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * `/feed` (docs/01 §2 and §3). Preferences in the URL are the whole feed for that request;
 * otherwise the saved cookie is; with neither, the form. Rendered per request: it is the one
 * public page that reads a cookie.
 */
export default async function Feed({ searchParams }: Props) {
  const sp = await searchParams;
  const saved = decodePreferences((await cookies()).get(PREFS_COOKIE)?.value) ?? null;
  const fromUrl = prefsFromSearch(sp);
  const prefs = fromUrl ?? saved;
  const editing = one(sp.edit) === "1";

  if (editing || !prefs) {
    return (
      <main className="mx-auto max-w-content md:px-2">
        <div className="max-w-[760px]">
          <div className="flex flex-col gap-1 px-4 pt-5 pb-5">
            <h1 className="text-page-title m-0">{prefs ? "Edit my feed" : "Set up my feed"}</h1>
            <p className="m-0 text-[13px] text-muted">
              Choose what you want to see. You can change it at any time.
            </p>
          </div>
          <PrefsForm prefs={prefs ?? EMPTY_PREFS} hasSaved={saved !== null} />
        </div>
      </main>
    );
  }

  const now = new Date();
  const serverNow = now.toISOString();
  const cursor = one(sp.cursor);
  const list = await feed(prefs, { now, cursor }).catch((e: unknown) => {
    if (e instanceof InvalidCursor) return null;
    throw e;
  });
  if (!list) redirect(feedHref(fromUrl));

  // The feed's two parts (data/feed): deadlines in the next 14 days, then the rest.
  const soonUntil = now.getTime() + 14 * DAY;
  const isSoon = (at: string | null) => {
    if (!at) return false;
    const t = Date.parse(at);
    return t >= now.getTime() && t <= soonUntil;
  };
  const shareUrl = `${siteUrl()}/feed?${prefsQuery(prefs)}`;
  let previous: boolean | undefined;

  return (
    <main className="mx-auto max-w-content md:px-2">
      <div className="max-w-[760px]">
        <div className="flex flex-col gap-2 px-4 pt-5 pb-4">
          <h1 className="text-page-title m-0">{fromUrl ? "A shared feed" : "My feed"}</h1>
          <p className="m-0 text-[13px] text-muted">{prefsSummary(prefs)}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <Link
              href={feedHref(fromUrl, { edit: true })}
              className="flex min-h-target items-center underline underline-offset-[3px]"
            >
              Edit
            </Link>
            {isEmptyPrefs(prefs) ? null : (
              <a
                href="#share"
                className="flex min-h-target items-center underline underline-offset-[3px]"
              >
                Share this feed
              </a>
            )}
            {fromUrl && saved ? (
              <Link
                href="/feed"
                className="flex min-h-target items-center underline underline-offset-[3px]"
              >
                Back to my feed
              </Link>
            ) : null}
          </div>
          {fromUrl ? (
            <form method="post" action="/api/prefs" className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="next" value="/feed" />
              <input type="hidden" name="kinds" value={prefs.kinds.join(",")} />
              <input type="hidden" name="city" value={prefs.city ?? ""} />
              <input type="hidden" name="tags" value={prefs.tags.join(",")} />
              {prefs.remoteOnly ? <input type="hidden" name="remote" value="1" /> : null}
              <button type="submit" className={buttonClass("secondary")}>
                Save as my feed
              </button>
              <span className="text-meta text-faint">
                {saved
                  ? "Replaces the feed saved on this device."
                  : "Kept in a cookie on this device."}
              </span>
            </form>
          ) : null}
        </div>

        {list.items.length ? (
          <RowList>
            {list.items.map((item) => {
              const soon = isSoon(item.deadlineAt);
              const band = soon === previous ? null : soon;
              previous = soon;
              return (
                <div key={item.slug} className="contents">
                  {band === null ? null : band ? (
                    <BandHeader
                      label="Closing in the next 14 days"
                      tone="amber"
                      range="soonest first"
                    />
                  ) : (
                    <BandHeader label="Everything else" tone="none" range="newest first" />
                  )}
                  <OpportunityRow item={item} serverNow={serverNow} />
                </div>
              );
            })}
            {list.nextCursor ? (
              <ListEnding href={feedHref(fromUrl, { cursor: list.nextCursor })} strong>
                Next page
              </ListEnding>
            ) : null}
          </RowList>
        ) : (
          <>
            <div className="flex flex-col gap-2.5 border-t border-line px-4 pt-8 pb-3">
              <h2 className="m-0 text-[18px] leading-6 font-semibold tracking-[-0.02em]">
                Nothing open matches this feed right now
              </h2>
              <p className="text-body m-0 text-muted">
                We read every source again within six hours. Anything new will appear here.
              </p>
            </div>
            <div className="mt-3">
              <RowList>
                <ListEnding href={feedHref(fromUrl, { edit: true })} strong>
                  Widen the feed
                </ListEnding>
                <ListEnding href="/opportunities" strong>
                  Everything open
                </ListEnding>
              </RowList>
            </div>
          </>
        )}

        {cursor ? (
          <p className="m-0 px-4 pt-4 text-[12px] text-faint">
            <Link href={feedHref(fromUrl)} className="underline underline-offset-2">
              Back to the first page
            </Link>
          </p>
        ) : null}

        {/* A feed of everything has no choices to carry: its address would be the bare page. */}
        {isEmptyPrefs(prefs) ? null : (
          <section
            id="share"
            aria-labelledby="share-title"
            className="flex max-w-[68ch] flex-col gap-2 px-4 pt-8 pb-10"
          >
            <h2 id="share-title" className="text-section m-0">
              Share this feed
            </h2>
            <p className="text-body m-0 text-muted">
              Anyone who opens this address sees the same feed. It carries the choices, nothing
              about you.
            </p>
            <code className="text-date block rounded-tile border border-line bg-surface px-3 py-2.5 text-[13px] break-all select-all">
              {shareUrl}
            </code>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Opportunities on devspot: ${prefsSummary(prefs)}\n${shareUrl}`)}`}
              target="_blank"
              rel="noopener"
              className="flex min-h-target w-fit items-center text-[14px] font-medium underline underline-offset-[3px]"
            >
              Share on WhatsApp
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </section>
        )}
      </div>
    </main>
  );
}
