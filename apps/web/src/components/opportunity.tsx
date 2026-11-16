import { findCity, type OpportunityDto } from "@devspot/schema";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { REPO_URL } from "@/data/site";
import { browseHref } from "@/ui/browse";
import { actionLabel, closedLine, deadlineView } from "@/ui/deadline";
import { jsonLdScript, opportunityJsonLd } from "@/ui/jsonld";
import { FAMILY_LABEL, KIND_FAMILY, KIND_PLURAL, kindsOf } from "@/ui/kind";
import { placeLabel } from "@/ui/place";
import { checkedAgo, formatDate, sourceDomain } from "@/ui/time";
import { target } from "@/ui/urgency";
import { buttonClass, RequirementsBlock } from "./blocks";
import { SectionHeader } from "./headers";
import { BackIcon, CalendarAddIcon, ExternalIcon, NotStatedIcon, ShareIcon } from "./icons";
import { KindTag } from "./kind-tag";
import { LiveIn, LiveStatus } from "./live";
import { RowList, Rows } from "./row-list";

type Related = { sameOrganization: OpportunityDto[]; sameKind: OpportunityDto[] };

/**
 * `/o/[slug]`, boards "Opportunity page" and "Opportunity page · desktop" (docs/01 §3). On a
 * phone: heading, deadline, actions, where it came from, requirements, about, related. From
 * 1024px the deadline, actions and source sit in a column on the right.
 */
export function Opportunity({
  item: o,
  related,
  serverNow,
}: {
  item: OpportunityDto;
  related: Related;
  serverNow: string;
}) {
  const now = new Date(serverNow);
  const closed = o.status === "closed";
  const family = KIND_FAMILY[o.kind];
  const host = sourceDomain(o.applyUrl ?? o.canonicalUrl);
  const dated = target(o) !== null;
  const cityName = o.city ? (findCity(o.city)?.name ?? o.city) : null;
  const share = `https://wa.me/?text=${encodeURIComponent(`${o.title} · ${o.organization.name}\n${o.url}`)}`;
  const report = `${REPO_URL}/issues/new?title=${encodeURIComponent(`Listing: ${o.title}`)}&body=${encodeURIComponent(`${o.url}\n\nWhat is wrong with this listing?\n`)}`;

  return (
    <main className="mx-auto max-w-content px-4 pb-10 md:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:gap-x-14">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON we build, with "<" escaped
        dangerouslySetInnerHTML={{ __html: jsonLdScript(opportunityJsonLd(o)) }}
      />

      <div className="lg:col-start-1 lg:row-start-1">
        <Link
          href={browseHref({ kinds: kindsOf(family) })}
          className="flex min-h-target w-fit items-center gap-1.5 text-[13px] text-muted no-underline hover:underline"
        >
          <BackIcon />
          {FAMILY_LABEL[family]}
        </Link>

        {closed ? (
          <p className="text-body m-0 mb-3 rounded-tile border border-line bg-raise px-3.5 py-3 font-medium">
            {closedLine(o)}
          </p>
        ) : null}

        <div className="flex flex-col gap-2.5 pt-1 pb-5 lg:gap-3.5 lg:pb-8">
          <div className="flex items-center justify-between gap-3 lg:justify-start">
            <KindTag kind={o.kind} closed={closed} />
            <LiveStatus item={o} serverNow={serverNow} />
          </div>
          <h1 className="text-page-title m-0 text-pretty lg:text-[38px] lg:leading-[44px] lg:tracking-[-0.035em]">
            {o.title}
          </h1>
          <div className="flex items-center gap-2.5 text-[14px] text-muted">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-line bg-raise text-[12px] font-semibold"
            >
              {o.organization.name.trim().charAt(0).toUpperCase()}
            </span>
            <span>
              <Link
                href={`/org/${o.organization.slug}`}
                className="font-medium text-fg no-underline hover:underline"
              >
                {o.organization.name}
              </Link>{" "}
              · {placeLabel(o)}
            </span>
          </div>
        </div>
      </div>

      <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-11">
        <DeadlineSection item={o} serverNow={serverNow} />

        <div className="flex flex-col gap-2.5 py-4">
          <a
            href={o.applyUrl ?? o.canonicalUrl}
            target="_blank"
            rel="noopener"
            className={
              closed
                ? `${buttonClass("secondary")} h-12`
                : "flex h-12 items-center justify-center gap-2 rounded-pill bg-fg px-4 text-[15px] font-semibold text-bg no-underline hover:opacity-90"
            }
          >
            {actionLabel(o)}
            <ExternalIcon />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <div className={`grid gap-2.5 ${dated && !closed ? "grid-cols-2" : "grid-cols-1"}`}>
            {dated && !closed ? (
              <a
                href={`/o/${o.slug}/calendar.ics`}
                className={`${buttonClass("secondary")} gap-1.5 px-2 text-[13px] whitespace-nowrap`}
              >
                <CalendarAddIcon />
                Add to calendar
              </a>
            ) : null}
            <a
              href={share}
              target="_blank"
              rel="noopener"
              className={`${buttonClass("secondary")} gap-1.5 px-2 text-[13px] whitespace-nowrap`}
            >
              <ShareIcon />
              Share on WhatsApp
            </a>
          </div>
          {closed ? null : (
            <p className="m-0 mt-0.5 text-[12px] leading-[17px] text-faint">
              {o.kind === "event" ? "The link goes to" : "You apply on"} {host}, not here. devspot
              never asks for money, documents or a login.
            </p>
          )}
        </div>

        <section aria-labelledby="where-from" className="border-t border-line pt-3.5 pb-1.5">
          <h2 id="where-from" className="text-section m-0 mb-1.5">
            Where this came from
          </h2>
          <dl className="m-0 text-[13px]">
            <Fact label="Source">
              <a
                href={o.canonicalUrl}
                target="_blank"
                rel="noopener"
                className="text-date text-[13px] underline underline-offset-[3px]"
              >
                {sourceDomain(o.canonicalUrl)}
              </a>
            </Fact>
            {o.lastVerifiedAt ? (
              <Fact label="Last checked">
                {checkedAgo(new Date(o.lastVerifiedAt), now).replace(/^checked /, "")}
              </Fact>
            ) : null}
            <Fact label="First listed" last>
              <span className="text-date text-[13px]">{formatDate(new Date(o.firstSeenAt))}</span>
            </Fact>
          </dl>
        </section>
      </aside>

      <div className="lg:col-start-1 lg:row-start-2">
        <div className="border-t border-line pt-5 pb-1.5 lg:pt-7">
          <RequirementsBlock orgName={o.organization.name} text={o.requirementsText} />
        </div>

        {o.summary ? (
          <section aria-labelledby="about" className="flex flex-col gap-2 pt-5 pb-6">
            <h2 id="about" className="text-section m-0">
              About
            </h2>
            <p className="text-prose m-0 max-w-[68ch] text-muted">{o.summary}</p>
          </section>
        ) : (
          <div className="pb-5" />
        )}

        {related.sameOrganization.length ? (
          <section aria-labelledby="more-org" className="-mx-4 border-t border-line md:mx-0">
            <SectionHeader
              id="more-org"
              title={`More from ${o.organization.name}`}
              link={{ href: browseHref({ org: o.organization.slug }), label: "See all" }}
            />
            <RowList>
              <Rows items={related.sameOrganization} serverNow={serverNow} />
            </RowList>
          </section>
        ) : null}

        {related.sameKind.length ? (
          <section aria-labelledby="more-kind" className="-mx-4 md:mx-0">
            <SectionHeader
              id="more-kind"
              title={`More ${KIND_PLURAL[o.kind].toLowerCase()}${cityName ? ` in ${cityName}` : ""}`}
              link={{
                href: browseHref({ kinds: [o.kind], city: o.city ?? undefined }),
                label: "See all",
              }}
            />
            <RowList>
              <Rows items={related.sameKind} serverNow={serverNow} />
            </RowList>
          </section>
        ) : null}

        <div className="pt-5">
          <a
            href={report}
            target="_blank"
            rel="noopener"
            className="flex min-h-target w-fit items-center text-[13px] text-muted underline underline-offset-[3px]"
          >
            Something wrong? Report this listing
          </a>
        </div>
      </div>
    </main>
  );
}

function Fact({
  label,
  children,
  last = false,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 py-[11px] ${last ? "" : "border-b border-line"}`}>
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

/** The large deadline (or event start), and under it the other dates the source gave. */
function DeadlineSection({ item: o, serverNow }: { item: OpportunityDto; serverNow: string }) {
  const view = deadlineView(o);
  const closed = o.status === "closed";
  const extra: { label: string; value: string }[] = [];
  if (o.opensAt)
    extra.push({ label: "Opens", value: formatDate(new Date(o.opensAt), { time: true }) });
  if (o.kind === "event") {
    if (o.endsAt)
      extra.push({ label: "Ends", value: formatDate(new Date(o.endsAt), { time: true }) });
    const venue = [o.venue?.name, o.venue?.address].filter(Boolean).join(", ");
    if (venue) extra.push({ label: "Venue", value: venue });
    // An event's own deadline, when the source states one. We do not know what it is for.
    if (o.deadlineAt && o.deadlineKind === "fixed") {
      extra.push({ label: "Deadline", value: formatDate(new Date(o.deadlineAt), { time: true }) });
    }
  }
  return (
    <section
      aria-label={o.kind === "event" ? "Date" : "Deadline"}
      className="-mx-4 flex flex-col gap-1.5 border-y border-line px-4 pt-[18px] pb-5 md:mx-0 md:px-0 lg:border-t-0 lg:pt-0"
    >
      {view.type === "dated" ? (
        <>
          <span className="text-meta text-muted">
            {view.label} · {view.date}
          </span>
          <div className="flex items-baseline gap-2.5">
            <span
              className={`text-hero-figure ${closed ? "text-faint line-through" : ""} ${view.unit ? "" : "text-[34px] leading-[40px]"}`}
            >
              {view.figure}
            </span>
            {view.unit ? (
              <span className="text-date text-[13px] text-muted">{view.unit}</span>
            ) : null}
          </div>
          <LiveIn item={o} serverNow={serverNow} />
        </>
      ) : (
        <>
          <span className="text-meta text-muted">{o.kind === "event" ? "Date" : "Deadline"}</span>
          <span className="flex items-center gap-2.5 text-[20px] leading-[26px] font-[550] tracking-[-0.02em]">
            <span className="shrink-0 text-faint">
              <NotStatedIcon />
            </span>
            {view.headline}
          </span>
          {closed ? null : (
            <span className="text-[13px] leading-[18px] text-muted">{view.note}</span>
          )}
        </>
      )}
      {extra.length ? (
        <dl className="m-0 mt-2 flex flex-col gap-1 text-[13px]">
          {extra.map((e) => (
            <div key={e.label} className="flex gap-2">
              <dt className="w-[72px] shrink-0 text-muted">{e.label}</dt>
              <dd className="m-0">{e.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
