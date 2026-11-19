import type { Metadata } from "next";
import { createOpportunity } from "@/admin/actions";
import { pageAddress } from "@/admin/create";
import { findExisting, organizationOptions, type QueueRow } from "@/admin/data";
import { Field, INPUT, Label, OpportunityFields } from "@/admin/fields";
import type { Editable } from "@/admin/form";
import { requireAdmin } from "@/admin/session";
import { buttonClass } from "@/components/blocks";

export const metadata: Metadata = { title: "New opportunity" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

const BLANK: Editable = {
  title: "",
  kind: null,
  summary: null,
  applyUrl: null,
  opensAt: null,
  deadlineAt: null,
  deadlineKind: "unknown",
  deadlineTimezone: null,
  startsAt: null,
  endsAt: null,
  locationMode: null,
  country: null,
  city: null,
  venueName: null,
  venueAddress: null,
  regionsTags: [],
  requirementsText: null,
  tags: [],
};

function Existing({ rows, heading }: { rows: QueueRow[]; heading: string }) {
  return (
    <section
      aria-label={heading}
      className="flex flex-col gap-1.5 rounded-tile border border-line bg-raise px-3.5 py-3"
    >
      <h2 className="m-0 text-[14px] font-semibold">{heading}</h2>
      <ul className="m-0 list-none p-0 text-[13px]">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
            <span>
              <span className="font-medium">{r.title}</span>{" "}
              <span className="text-muted">
                · {r.organization.name} · {r.status}
              </span>
            </span>
            <a
              href={`/admin/o/${r.id}?back=%2Fadmin`}
              className={`${buttonClass("primary")} h-9 text-[13px]`}
            >
              Open existing
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * /admin/new (docs/01 §4), in two steps so the duplicate check really comes before saving and
 * works with no JavaScript. Step one: organisation, page address and title, checked against
 * what exists. Step two: every field, with those three carried over.
 */
export default async function NewOpportunity({ searchParams }: Props) {
  await requireAdmin();
  const sp = await searchParams;
  const org = one(sp.org);
  const rawUrl = one(sp.url);
  const title = one(sp.title);
  const error = one(sp.error);
  const confirmed = one(sp.confirm) === "1";
  const orgs = await organizationOptions();
  const orgName = orgs.find((o) => o.slug === org)?.name;
  const url = pageAddress(rawUrl);

  const asked = Boolean(org || rawUrl || title);
  const problem = !asked
    ? null
    : !orgName
      ? "Choose an organisation from the registry."
      : !url
        ? "The page address must be a web address (https://…)."
        : !title
          ? "Give the title as the page states it."
          : null;
  const existing =
    asked && !problem && url ? await findExisting(org, url, title, new Date()) : null;
  const blocked = Boolean(existing?.sameUrl);
  const similar = existing?.sameKey ?? [];
  const stepTwo = asked && !problem && !blocked && (similar.length === 0 || confirmed);

  return (
    <main className="flex max-w-[760px] flex-col gap-4 pt-4">
      <a href="/admin" className="w-fit text-[13px] underline underline-offset-[3px]">
        Back to the queue
      </a>
      <h1 className="text-page-title m-0">New opportunity</h1>
      <p className="m-0 text-[13px] text-muted">
        For a manual source, or anything the engine missed. Enter only what the organisation's own
        page states.
      </p>
      {error ? (
        <p
          role="alert"
          className="text-body m-0 rounded-tile border border-red px-3.5 py-3 text-red"
        >
          Not saved. {error}
        </p>
      ) : null}

      {stepTwo ? null : (
        <form action="/admin/new" method="get" className="flex flex-col gap-3.5">
          <Field>
            <Label htmlFor="org">Organisation</Label>
            <select id="org" name="org" required defaultValue={org} className={INPUT}>
              <option value="">Choose one</option>
              {orgs.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <Label htmlFor="url">The opportunity's page on the organisation's site</Label>
            <input
              id="url"
              name="url"
              type="url"
              required
              defaultValue={rawUrl}
              className={INPUT}
            />
          </Field>
          <Field>
            <Label htmlFor="title">Title, as the page states it</Label>
            <input id="title" name="title" required defaultValue={title} className={INPUT} />
          </Field>
          {problem ? (
            <p role="alert" className="m-0 text-[13px] text-red">
              {problem}
            </p>
          ) : null}
          {existing?.sameUrl ? (
            <Existing
              rows={[existing.sameUrl]}
              heading="This page is already listed. A page can be listed once."
            />
          ) : null}
          {!blocked && similar.length ? (
            <>
              <Existing
                rows={similar}
                heading="This looks like an opportunity already listed: same organisation, a similar title, the same year."
              />
              <a
                href={`/admin/new?${new URLSearchParams({ org, url: rawUrl, title, confirm: "1" }).toString()}`}
                className="w-fit text-[13px] underline underline-offset-[3px]"
              >
                This is a different opportunity. Continue.
              </a>
            </>
          ) : null}
          <button type="submit" className={`${buttonClass(asked ? "secondary" : "primary")} w-fit`}>
            Check and continue
          </button>
        </form>
      )}

      {stepTwo && url ? (
        <form action={createOpportunity} className="flex flex-col gap-3.5">
          <input type="hidden" name="org" value={org} />
          <input type="hidden" name="canonicalUrl" value={url} />
          <p className="m-0 text-[13px]">
            <span className="font-medium">{orgName}</span> ·{" "}
            <span className="text-date text-[13px] break-all">{url}</span> ·{" "}
            <a
              href={`/admin/new?${new URLSearchParams({ org, url: rawUrl, title }).toString()}`}
              className="underline underline-offset-[3px]"
            >
              Change
            </a>
          </p>
          <OpportunityFields v={{ ...BLANK, title }} />
          <Field>
            <Label htmlFor="note">Note, kept in the history</Label>
            <input id="note" name="note" className={INPUT} />
          </Field>
          <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
            <button type="submit" name="intent" value="publish" className={buttonClass("primary")}>
              Publish
            </button>
            <button
              type="submit"
              name="intent"
              value="save"
              formNoValidate
              className={buttonClass("secondary")}
            >
              Save without publishing
            </button>
          </div>
        </form>
      ) : null}
    </main>
  );
}
