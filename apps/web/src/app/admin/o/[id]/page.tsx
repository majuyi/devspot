import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { markDuplicate, saveOpportunity } from "@/admin/actions";
import { duplicateCandidates, getItem, type Item } from "@/admin/data";
import { Field, INPUT, Label, OpportunityFields } from "@/admin/fields";
import { safeBack } from "@/admin/form";
import { highlight } from "@/admin/highlight";
import { requireAdmin } from "@/admin/session";
import { buttonClass } from "@/components/blocks";
import { ago } from "@/ui/status";
import { formatDate } from "@/ui/time";

export const metadata: Metadata = { title: "Review" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const ACTION_WORD: Record<string, string> = {
  created: "Created",
  edited: "Edited",
  published: "Published",
  unpublished: "Unpublished",
  rejected: "Rejected",
  markedDuplicate: "Marked duplicate",
  deadlineChanged: "Deadline changed",
  closed: "Closed",
};

function History({ item, now }: { item: Item; now: Date }) {
  if (!item.events.length) {
    return <p className="m-0 text-[13px] text-muted">No recorded changes yet.</p>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
      {item.events.map((e) => (
        <li key={e.id} className="flex flex-col gap-0.5">
          <span>
            <span className="font-medium">{ACTION_WORD[e.action] ?? e.action}</span>{" "}
            <span className="text-muted">
              by {e.actor}, {ago(e.at.toISOString(), now)}
            </span>
          </span>
          {Object.keys(e.changes as object).length ? (
            <span className="text-date text-[12px] break-words text-muted">
              {Object.keys(e.changes as object).join(", ")}
            </span>
          ) : null}
          {e.note ? <span className="text-muted">“{e.note}”</span> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * The review item view (docs/01 §4): the source text on the left with dates and place words
 * marked, every editable field on the right. Publish needs a kind and a location, which the
 * browser enforces; Save and the two status buttons skip that check.
 */
export default async function ReviewItem({ params, searchParams }: Props) {
  await requireAdmin();
  const item = await getItem((await params).id);
  if (!item) notFound();
  const sp = await searchParams;
  const back = safeBack(one(sp.back));
  const error = one(sp.error);
  const saved = one(sp.saved) === "1";
  const now = new Date();
  const sure = (item.fieldConfidence ?? {}) as Record<string, number | undefined>;
  const isPublic = item.status === "published" || item.status === "closed";
  const inReview = item.status === "review";
  const dupq = one(sp.dupq).trim().slice(0, 200);
  const candidates = dupq && !item.duplicateOf ? await duplicateCandidates(item.id, dupq) : [];
  const self = `/admin/o/${item.id}`;

  return (
    <main className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <a href={back} className="underline underline-offset-[3px]">
          Back to the queue
        </a>
        <span className="text-muted">
          {item.organization.name} · {item.status} · overall sure {item.confidence.toFixed(2)} ·{" "}
          {item.extractionMethod}
          {isPublic ? (
            <>
              {" · "}
              <a href={`/o/${item.slug}`} className="underline underline-offset-[3px]">
                View on site
              </a>
            </>
          ) : null}
        </span>
      </div>
      <h1 className="text-page-title m-0 text-pretty">{item.title}</h1>
      {error ? (
        <p
          role="alert"
          className="text-body m-0 rounded-tile border border-red px-3.5 py-3 text-red"
        >
          Not saved. {error}
        </p>
      ) : null}
      {saved ? (
        <p
          role="status"
          className="text-body m-0 rounded-tile border border-line bg-raise px-3.5 py-3"
        >
          Saved.
        </p>
      ) : null}
      {item.duplicateOf ? (
        <p className="m-0 text-[13px]">
          Duplicate of{" "}
          <a
            href={`/admin/o/${item.duplicateOf.id}?back=${encodeURIComponent(back)}`}
            className="underline underline-offset-[3px]"
          >
            {item.duplicateOf.title}
          </a>
        </p>
      ) : null}
      {item.sourceDeadlineAt ? (
        <p role="status" className="text-body m-0 rounded-tile border border-amber px-3.5 py-3">
          The source page now states the deadline as{" "}
          <span className="text-date">{formatDate(item.sourceDeadlineAt, { time: true })}</span>.
          This item shows{" "}
          <span className="text-date">
            {item.deadlineAt ? formatDate(item.deadlineAt, { time: true }) : "no deadline"}
          </span>{" "}
          because a maintainer reviewed it. Check the page, correct the deadline below if it moved,
          and save: saving clears this notice.
        </p>
      ) : null}
      {item.statusReason ? (
        <p className="m-0 text-[13px] text-muted">Reason on record: {item.statusReason}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="source" className="flex min-w-0 flex-col gap-2">
          <h2 id="source" className="text-section m-0">
            Source text
          </h2>
          <a
            href={item.canonicalUrl}
            target="_blank"
            rel="noopener"
            className="text-date text-[13px] break-all underline underline-offset-[3px]"
          >
            {item.canonicalUrl}
          </a>
          {item.rawItem ? (
            <>
              <p className="m-0 text-[12px] text-faint">
                <mark className="rounded-[3px] bg-k-funding-bg px-0.5 text-k-funding-fg">
                  dates
                </mark>{" "}
                and{" "}
                <mark className="rounded-[3px] bg-k-work-bg px-0.5 text-k-work-fg">
                  place words
                </mark>{" "}
                are marked to help you find them. Check each against the page itself.
              </p>
              <div className="max-h-[75vh] overflow-y-auto rounded-tile border border-line bg-surface p-3 text-[14px] leading-[21px] whitespace-pre-wrap">
                {highlight(item.rawItem.text).map((s, i) =>
                  s.mark ? (
                    <mark
                      // biome-ignore lint/suspicious/noArrayIndexKey: static runs of one text, never reordered
                      key={i}
                      className={`rounded-[3px] px-0.5 ${
                        s.mark === "date"
                          ? "bg-k-funding-bg text-k-funding-fg"
                          : "bg-k-work-bg text-k-work-fg"
                      }`}
                    >
                      {s.text}
                    </mark>
                  ) : (
                    s.text
                  ),
                )}
              </div>
            </>
          ) : (
            <p className="text-body m-0 text-muted">
              No source text is stored for this item. Open the page above.
            </p>
          )}
          <h2 className="text-section m-0 mt-4">History</h2>
          <History item={item} now={now} />
          {item.duplicateOf ? null : (
            <section aria-labelledby="duplicate" className="mt-4 flex flex-col gap-2">
              <h2 id="duplicate" className="text-section m-0">
                Mark duplicate of
              </h2>
              <p className="m-0 text-[13px] text-muted">
                Find the original. Marking this item a duplicate takes it off the site and keeps a
                link to the original.
              </p>
              {/* biome-ignore lint/a11y/useSemanticElements: <search> is not yet in every browser */}
              <form action={self} method="get" role="search" className="flex gap-2">
                <input type="hidden" name="back" value={back} />
                <label htmlFor="dupq" className="sr-only">
                  Title or address of the original
                </label>
                <input
                  id="dupq"
                  name="dupq"
                  type="search"
                  defaultValue={dupq}
                  placeholder="Title or address of the original"
                  className={INPUT}
                />
                <button type="submit" className={`${buttonClass("secondary")} h-10 shrink-0`}>
                  Search
                </button>
              </form>
              {dupq ? (
                candidates.length ? (
                  <ul className="m-0 flex list-none flex-col p-0 text-[13px]">
                    {candidates.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 border-b border-line py-2"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">{c.title}</span>
                          <span className="truncate text-muted">
                            {c.organization.name} · {c.status} · {c.canonicalUrl}
                          </span>
                        </span>
                        <form action={markDuplicate} className="shrink-0">
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="originalId" value={c.id} />
                          <input type="hidden" name="back" value={back} />
                          <button
                            type="submit"
                            className={`${buttonClass("secondary")} h-9 text-[13px]`}
                          >
                            Mark as copy<span className="sr-only"> of {c.title}</span>
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-[13px] text-muted">Nothing else matches “{dupq}”.</p>
                )
              ) : null}
            </section>
          )}
        </section>

        <form action={saveOpportunity} className="flex min-w-0 flex-col gap-3.5">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="back" value={back} />
          <h2 className="text-section m-0">Fields</h2>

          <OpportunityFields v={item} sure={sure} />

          <Field>
            <Label htmlFor="note">Note or reason, kept in the history</Label>
            <input id="note" name="note" className={INPUT} />
          </Field>

          <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
            <button type="submit" name="intent" value="publish" className={buttonClass("primary")}>
              {item.status === "published" ? "Save changes" : "Publish"}
            </button>
            {inReview ? (
              <button
                type="submit"
                name="intent"
                value="publishNext"
                className={buttonClass("secondary")}
              >
                Publish and next
              </button>
            ) : null}
            {item.status === "published" ? null : (
              // Saving a draft must not demand the fields only publishing needs.
              <button
                type="submit"
                name="intent"
                value="save"
                formNoValidate
                className={buttonClass("secondary")}
              >
                Save without publishing
              </button>
            )}
            {inReview ? (
              <button
                type="submit"
                name="intent"
                value="reject"
                formNoValidate
                className={buttonClass("ghost")}
              >
                Reject
              </button>
            ) : null}
            {isPublic ? (
              <button
                type="submit"
                name="intent"
                value="unpublish"
                formNoValidate
                className={buttonClass("ghost")}
              >
                Unpublish
              </button>
            ) : null}
          </div>
          <p className="m-0 text-[12px] text-faint">
            Organisation and source address are fixed here. Reject and Unpublish keep the note above
            as the reason and ignore other edits.
          </p>
        </form>
      </div>
    </main>
  );
}
