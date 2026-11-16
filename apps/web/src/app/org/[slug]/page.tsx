import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListEnding, StatusBadge } from "@/components/blocks";
import { SectionHeader } from "@/components/headers";
import { BackIcon } from "@/components/icons";
import { LogoTile } from "@/components/logo-tile";
import { GroupedRows, RowList, Rows } from "@/components/row-list";
import { countOpportunities, listOpportunities, pastOpportunities } from "@/data/opportunities";
import { getOrganization } from "@/data/organizations";
import { REPO_URL } from "@/data/site";
import { browseHref } from "@/ui/browse";
import { baseLabel, CATEGORY_LABEL, registryPath, SOURCE_KIND_LABEL, worstHealth } from "@/ui/org";
import { checkedAgo, sourceDomain } from "@/ui/time";

// Cached like every public page; each organisation is rendered on its first visit.
export const revalidate = 900;

export function generateStaticParams() {
  return [];
}

const OPEN_SHOWN = 30;
const PAST_SHOWN = 10;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const org = await getOrganization((await params).slug);
  if (!org) return { title: "Not found" };
  const description =
    org.description?.trim() ??
    `Opportunities from ${org.name}, read from its own pages every six hours.`;
  return {
    title: org.name,
    description,
    alternates: { canonical: `/org/${org.slug}` },
    openGraph: {
      type: "website",
      title: org.name,
      description,
      url: `/org/${org.slug}`,
      siteName: "devspot",
    },
    twitter: { card: "summary", title: org.name, description },
  };
}

/** `/org/[slug]` (docs/01 §3): who they are, what is open, what closed, how we read them. */
export default async function Organisation({ params }: Props) {
  const org = await getOrganization((await params).slug);
  if (!org) notFound();
  const now = new Date();
  const serverNow = now.toISOString();
  const [open, openTotal, past] = await Promise.all([
    listOpportunities({ org: org.slug, limit: OPEN_SHOWN }, { now }),
    countOpportunities({ org: org.slug }, { now }),
    // One more than shown, to know whether to offer the rest.
    pastOpportunities(org.slug, { limit: PAST_SHOWN + 1 }),
  ]);
  const registry = `${REPO_URL}/blob/main/${registryPath(org.slug)}`;

  return (
    <main className="mx-auto max-w-content md:px-2">
      <div className="max-w-[760px]">
        <div className="px-4">
          <Link
            href="/org"
            className="flex min-h-target w-fit items-center gap-1.5 text-[13px] text-muted no-underline hover:underline"
          >
            <BackIcon />
            Organisations
          </Link>
          <div className="flex flex-col gap-3 pt-1 pb-5">
            <div className="flex items-center gap-3">
              <LogoTile name={org.name} logoUrl={org.logoUrl} />
              <h1 className="text-page-title m-0 text-pretty">{org.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              <span>
                {CATEGORY_LABEL[org.category]} · {baseLabel(org)}
              </span>
              <StatusBadge state={worstHealth(org.sources.map((s) => s.health))} />
            </div>
            {org.description ? (
              <p className="text-prose m-0 max-w-[68ch]">{org.description.trim()}</p>
            ) : null}
            <a
              href={org.homepageUrl}
              target="_blank"
              rel="noopener"
              className="text-date flex min-h-target w-fit items-center text-[13px] underline underline-offset-[3px]"
            >
              {sourceDomain(org.homepageUrl)}
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>

        <section aria-labelledby="open-now" className="border-t border-line">
          <SectionHeader
            id="open-now"
            title="Open now"
            link={
              openTotal > 0
                ? {
                    href: browseHref({ org: org.slug }),
                    label: `All ${openTotal.toLocaleString("en-GB")} open`,
                  }
                : undefined
            }
          />
          {open.items.length ? (
            <RowList>
              <GroupedRows items={open.items} serverNow={serverNow} />
              {openTotal > open.items.length ? (
                <ListEnding href={browseHref({ org: org.slug })} strong>
                  {(openTotal - open.items.length).toLocaleString("en-GB")} more open
                </ListEnding>
              ) : null}
            </RowList>
          ) : (
            <p className="text-body m-0 px-4 pb-2 text-muted">
              Nothing from {org.name} is open right now. We read its pages every six hours.
            </p>
          )}
        </section>

        {past.length ? (
          <section aria-labelledby="past">
            <SectionHeader id="past" title="Past" />
            <RowList>
              <Rows items={past.slice(0, PAST_SHOWN)} serverNow={serverNow} />
              {past.length > PAST_SHOWN ? (
                <ListEnding href={browseHref({ org: org.slug, closed: true })}>
                  Everything from {org.name}, closed items included
                </ListEnding>
              ) : null}
            </RowList>
          </section>
        ) : null}

        <section aria-labelledby="tracking" className="px-4 pb-8">
          <div className="-mx-4">
            <SectionHeader id="tracking" title="How we track this organisation" />
          </div>
          {org.sources.length ? (
            <ul className="m-0 flex list-none flex-col border-y border-line p-0">
              {org.sources.map((s, i) => (
                <li
                  key={s.key}
                  className={`flex flex-col gap-1 py-3 ${i ? "border-t border-line" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="font-medium">{SOURCE_KIND_LABEL[s.kind]}</span>
                    <StatusBadge state={s.health} />
                  </div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener"
                    className="text-date text-[13px] break-all underline underline-offset-[3px]"
                  >
                    {s.url.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                  <span className="text-meta text-faint">
                    {s.lastOkAt
                      ? `Last read ${checkedAgo(new Date(s.lastOkAt), now).replace(/^checked /, "")}`
                      : "Not read yet"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body m-0 text-muted">
              No source is set up for this organisation yet.
            </p>
          )}
          <a
            href={registry}
            target="_blank"
            rel="noopener"
            className="mt-2 flex min-h-target w-fit items-center text-[13px] underline underline-offset-[3px]"
          >
            Improve this entry on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>
      </div>
    </main>
  );
}
