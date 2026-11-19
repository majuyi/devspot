import { CITIES, DeadlineKind, LocationMode, OpportunityKind, TAGS } from "@devspot/schema";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { saveOpportunity } from "@/admin/actions";
import { getItem, type Item } from "@/admin/data";
import { lagosInputs, safeBack } from "@/admin/form";
import { highlight } from "@/admin/highlight";
import { requireAdmin } from "@/admin/session";
import { buttonClass } from "@/components/blocks";
import { KIND_LABEL } from "@/ui/kind";
import { tagLabel } from "@/ui/prefs";
import { ago } from "@/ui/status";
import { formatDate } from "@/ui/time";

export const metadata: Metadata = { title: "Review" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const INPUT = "h-10 w-full rounded-tile border border-line bg-surface px-2.5 text-[14px] text-fg";
const AREA = "w-full rounded-tile border border-line bg-surface px-2.5 py-2 text-[14px] text-fg";
const LABEL = "flex items-baseline justify-between gap-2 text-[12px] font-medium text-muted";

const DEADLINE_KIND: Record<DeadlineKind, string> = {
  unknown: "Not stated on the source page",
  fixed: "Fixed: the source states a date",
  rolling: "Rolling applications",
  multiRound: "Multiple rounds",
};
const LOCATION: Record<LocationMode, string> = {
  remote: "Remote",
  onsite: "On site",
  hybrid: "Hybrid",
};

/** A label with the extractor's confidence for that field, when it gave one. */
function Label({ htmlFor, children, sure }: { htmlFor: string; children: string; sure?: number }) {
  return (
    <label htmlFor={htmlFor} className={LABEL}>
      {children}
      {sure === undefined ? null : (
        <span className="text-date text-[11px] font-normal text-faint">sure {sure.toFixed(2)}</span>
      )}
    </label>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-1">{children}</div>;
}

/** A date and an optional time, as the source states them, in Lagos time. */
function When({
  name,
  label,
  at,
  sure,
}: {
  name: string;
  label: string;
  at: Date | null;
  sure?: number;
}) {
  const v = lagosInputs(at);
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
      <legend className={`${LABEL} w-full p-0`}>
        {label}
        {sure === undefined ? null : (
          <span className="text-date text-[11px] font-normal text-faint">
            sure {sure.toFixed(2)}
          </span>
        )}
      </legend>
      <div className="flex gap-2">
        <input
          type="date"
          name={`${name}Date`}
          defaultValue={v.date}
          aria-label={`${label}, date`}
          className={INPUT}
        />
        <input
          type="time"
          name={`${name}Time`}
          defaultValue={v.time}
          aria-label={`${label}, time, only if the source states one`}
          className={`${INPUT} max-w-[130px]`}
        />
      </div>
    </fieldset>
  );
}

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
        </section>

        <form action={saveOpportunity} className="flex min-w-0 flex-col gap-3.5">
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="back" value={back} />
          <h2 className="text-section m-0">Fields</h2>

          <Field>
            <Label htmlFor="title" sure={sure.title}>
              Title
            </Label>
            <input id="title" name="title" required defaultValue={item.title} className={INPUT} />
          </Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field>
              <Label htmlFor="kind" sure={sure.kind}>
                Kind
              </Label>
              <select
                id="kind"
                name="kind"
                required
                defaultValue={item.kind ?? ""}
                className={INPUT}
              >
                <option value="">Not set</option>
                {OpportunityKind.options.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <Label htmlFor="locationMode" sure={sure.locationMode}>
                Location
              </Label>
              <select
                id="locationMode"
                name="locationMode"
                required
                defaultValue={item.locationMode ?? ""}
                className={INPUT}
              >
                <option value="">Not set</option>
                {LocationMode.options.map((m) => (
                  <option key={m} value={m}>
                    {LOCATION[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <Label htmlFor="country" sure={sure.country}>
                Country (two letters; empty if not tied to one)
              </Label>
              <input
                id="country"
                name="country"
                maxLength={2}
                defaultValue={item.country ?? ""}
                className={INPUT}
              />
            </Field>
            <Field>
              <Label htmlFor="city" sure={sure.city}>
                City (empty with NG means nationwide)
              </Label>
              <select id="city" name="city" defaultValue={item.city ?? ""} className={INPUT}>
                <option value="">None</option>
                {CITIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field>
            <Label htmlFor="deadlineKind" sure={sure.deadlineKind}>
              Deadline, only as the organisation's page states it
            </Label>
            <select
              id="deadlineKind"
              name="deadlineKind"
              defaultValue={item.deadlineKind}
              className={INPUT}
            >
              {DeadlineKind.options.map((k) => (
                <option key={k} value={k}>
                  {DEADLINE_KIND[k]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <When
              name="deadlineAt"
              label="Deadline date"
              at={item.deadlineAt}
              sure={sure.deadlineAt}
            />
            <Field>
              <Label htmlFor="deadlineTimezone">Time zone, if the source names one</Label>
              <input
                id="deadlineTimezone"
                name="deadlineTimezone"
                placeholder="Africa/Lagos"
                defaultValue={item.deadlineTimezone ?? ""}
                className={INPUT}
              />
            </Field>
            <When name="opensAt" label="Opens" at={item.opensAt} sure={sure.opensAt} />
            <When name="startsAt" label="Starts" at={item.startsAt} sure={sure.startsAt} />
            <When name="endsAt" label="Ends" at={item.endsAt} sure={sure.endsAt} />
          </div>
          <p className="m-0 text-[12px] text-faint">
            Dates and times are in Lagos time. Leave the time empty unless the source gives one.
            {item.deadlineAt
              ? ` Stored deadline: ${formatDate(item.deadlineAt, { time: true })}.`
              : ""}
          </p>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field>
              <Label htmlFor="venueName">Venue</Label>
              <input
                id="venueName"
                name="venueName"
                defaultValue={item.venueName ?? ""}
                className={INPUT}
              />
            </Field>
            <Field>
              <Label htmlFor="venueAddress">Venue address</Label>
              <input
                id="venueAddress"
                name="venueAddress"
                defaultValue={item.venueAddress ?? ""}
                className={INPUT}
              />
            </Field>
          </div>
          <Field>
            <Label htmlFor="applyUrl">Apply link, if different from the page above</Label>
            <input
              id="applyUrl"
              name="applyUrl"
              type="url"
              defaultValue={item.applyUrl ?? ""}
              className={INPUT}
            />
          </Field>
          <Field>
            <Label htmlFor="summary" sure={sure.summary}>
              Summary (280 characters at most; never says who qualifies)
            </Label>
            <textarea
              id="summary"
              name="summary"
              rows={3}
              maxLength={280}
              defaultValue={item.summary ?? ""}
              className={AREA}
            />
          </Field>
          <Field>
            <Label htmlFor="requirementsText" sure={sure.requirementsText}>
              Requirements, word for word from the source
            </Label>
            <textarea
              id="requirementsText"
              name="requirementsText"
              rows={7}
              defaultValue={item.requirementsText ?? ""}
              className={AREA}
            />
          </Field>
          <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
            <legend className={`${LABEL} p-0`}>Topics</legend>
            <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
              {TAGS.map((t) => (
                <label key={t} className="flex min-h-9 items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    name="tags"
                    value={t}
                    defaultChecked={item.tags.includes(t)}
                    className="size-4 accent-fg"
                  />
                  {tagLabel(t)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field>
            <Label htmlFor="regionsTags">Region hints, comma separated</Label>
            <input
              id="regionsTags"
              name="regionsTags"
              defaultValue={item.regionsTags.join(", ")}
              className={INPUT}
            />
          </Field>

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
