import { OpportunityKind } from "@devspot/schema";
import {
  listQueue,
  listSubmissions,
  organizationOptions,
  PAGE_SIZE,
  parseQueue,
  type QueueFilters,
  queueHref,
  STATUSES,
  TABS,
  type Tab,
  tabCounts,
} from "@/admin/data";
import { requireAdmin } from "@/admin/session";
import { buttonClass } from "@/components/blocks";
import { KIND_LABEL } from "@/ui/kind";
import { ago } from "@/ui/status";
import { formatDate } from "@/ui/time";

const TAB_LABEL: Record<Tab, string> = {
  review: "In review",
  all: "All",
  submissions: "Submissions",
};

const INPUT = "h-10 rounded-tile border border-line bg-surface px-2.5 text-[14px] text-fg";
const CELL = "border-t border-line px-2.5 py-2 text-left align-top";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The review queue (docs/01 §4). The tab, search, filters and page are all in the URL, and
 * each item link carries that URL along, so an action returns to the same view.
 */
export default async function Queue({ searchParams }: Props) {
  await requireAdmin();
  const f = parseQueue(await searchParams);
  const now = new Date();
  const [counts, list, submissions, orgs] = await Promise.all([
    tabCounts(),
    f.tab === "submissions" ? null : listQueue(f),
    f.tab === "submissions" ? listSubmissions() : null,
    f.tab === "all" ? organizationOptions() : [],
  ]);
  const here = queueHref(f);
  const pages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const pageHref = (page: number) => queueHref({ ...f, page } satisfies QueueFilters);

  return (
    <main className="flex flex-col gap-4 pt-4">
      <h1 className="sr-only">Review queue</h1>
      <nav aria-label="Queues" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <a
            key={t}
            href={queueHref({ tab: t })}
            aria-current={t === f.tab ? "page" : undefined}
            className={`flex h-10 items-center gap-2 rounded-chip px-3.5 text-[13px] font-semibold no-underline ${
              t === f.tab ? "bg-fg text-bg" : "border border-line hover:bg-raise"
            }`}
          >
            {TAB_LABEL[t]}
            <span className="text-date text-[12px] opacity-75">{counts[t]}</span>
          </a>
        ))}
      </nav>

      {f.tab === "all" ? (
        // biome-ignore lint/a11y/useSemanticElements: <search> is not yet in every browser
        <form action="/admin" method="get" role="search" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="all" />
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            Title, organisation or URL
            <input name="q" type="search" defaultValue={f.q} className={`${INPUT} w-[260px]`} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            Status
            <select name="status" defaultValue={f.status ?? ""} className={INPUT}>
              <option value="">Any</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            Kind
            <select name="kind" defaultValue={f.kind ?? ""} className={INPUT}>
              <option value="">Any</option>
              {OpportunityKind.options.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            Organisation
            <select name="org" defaultValue={f.org ?? ""} className={`${INPUT} max-w-[220px]`}>
              <option value="">Any</option>
              {orgs.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={`${buttonClass("secondary")} h-10`}>
            Filter
          </button>
          {f.q || f.status || f.kind || f.org ? (
            <a
              href={queueHref({ tab: "all" })}
              className="flex h-10 items-center text-[13px] underline"
            >
              Clear
            </a>
          ) : null}
        </form>
      ) : null}

      {list ? (
        <>
          <p className="m-0 text-[13px] text-muted" aria-live="polite">
            {list.total.toLocaleString("en-GB")} {list.total === 1 ? "item" : "items"}
            {f.tab === "review" ? ", least sure first" : ", last changed first"}
            {pages > 1 ? ` · page ${f.page} of ${pages}` : ""}
          </p>
          {list.rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse border-b border-line text-[13px]">
                <caption className="sr-only">{TAB_LABEL[f.tab]}</caption>
                <thead>
                  <tr className="text-[12px] text-muted">
                    {["Title", "Organisation", "Kind", "Status", "Sure", "Date", "Changed"].map(
                      (h) => (
                        <th key={h} scope="col" className="px-2.5 py-2 text-left font-medium">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((r) => {
                    const date = r.kind === "event" ? r.startsAt : r.deadlineAt;
                    return (
                      <tr key={r.id} className="hover:bg-raise">
                        <th scope="row" className={`${CELL} max-w-[340px] font-medium`}>
                          <a
                            href={`/admin/o/${r.id}?back=${encodeURIComponent(here)}`}
                            className="underline underline-offset-[3px]"
                          >
                            {r.title}
                          </a>
                        </th>
                        <td className={CELL}>{r.organization.name}</td>
                        <td className={CELL}>{r.kind ? KIND_LABEL[r.kind] : "Not set"}</td>
                        <td className={CELL}>{r.status}</td>
                        <td className={`${CELL} text-date text-[13px]`}>
                          {r.confidence.toFixed(2)}
                        </td>
                        <td className={`${CELL} text-date text-[13px]`}>
                          {date ? formatDate(date, { time: true }) : r.deadlineKind}
                        </td>
                        <td className={`${CELL} text-date text-[13px]`}>
                          {ago(r.updatedAt.toISOString(), now)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-body m-0 text-muted">
              {f.tab === "review" ? "Nothing is waiting for review." : "Nothing matches."}
            </p>
          )}
          {pages > 1 ? (
            <nav aria-label="Pages" className="flex gap-3 text-[14px]">
              {f.page > 1 ? (
                <a href={pageHref(f.page - 1)} className="underline">
                  Previous
                </a>
              ) : null}
              {f.page < pages ? (
                <a href={pageHref(f.page + 1)} className="underline">
                  Next
                </a>
              ) : null}
            </nav>
          ) : null}
        </>
      ) : null}

      {submissions ? (
        submissions.length ? (
          <ul className="m-0 flex list-none flex-col border-y border-line p-0 text-[13px]">
            {submissions.map((s, i) => (
              <li
                key={s.id}
                className={`flex flex-col gap-1 py-2.5 ${i ? "border-t border-line" : ""}`}
              >
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener"
                  className="text-date text-[13px] break-all underline"
                >
                  {s.url}
                </a>
                {s.note ? <span>{s.note}</span> : null}
                <span className="text-muted">
                  {s.channel} · {ago(s.receivedAt.toISOString(), now)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body m-0 text-muted">
            No new submissions. The public form arrives with /submit.
          </p>
        )
      ) : null}
    </main>
  );
}
