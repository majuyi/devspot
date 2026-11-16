import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/blocks";
import { BandHeader } from "@/components/headers";
import { LogoTile } from "@/components/logo-tile";
import { RowList } from "@/components/row-list";
import { listOrganizations } from "@/data/organizations";
import { baseLabel, byCategory, CATEGORY_PLURAL, worstHealth } from "@/ui/org";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Organisations",
  description:
    "Every organisation whose own pages we read for opportunities, with how many are open and whether we can still read them.",
  alternates: { canonical: "/org" },
};

/** `/org` (docs/01 §3): every enabled organisation by category, open count and health. */
export default async function Organisations() {
  // Far above the registry's size; the list is one page by design.
  const { items } = await listOrganizations({ limit: 1000 });
  const groups = byCategory(items);
  return (
    <main className="mx-auto max-w-content md:px-2">
      <div className="max-w-[760px]">
        <div className="flex flex-col gap-1 px-4 pt-5 pb-4">
          <h1 className="text-page-title m-0">Organisations</h1>
          <p className="m-0 text-[13px] text-muted">
            {items.length.toLocaleString("en-GB")}{" "}
            {items.length === 1 ? "organisation" : "organisations"}. We read each one's own pages
            every six hours.
          </p>
        </div>
        {groups.length ? (
          <RowList>
            {groups.map((g) => (
              <section
                key={g.category}
                aria-label={CATEGORY_PLURAL[g.category]}
                className="contents"
              >
                <BandHeader
                  label={CATEGORY_PLURAL[g.category]}
                  tone="none"
                  range={String(g.orgs.length)}
                />
                {g.orgs.map((o) => (
                  <Link
                    key={o.slug}
                    href={`/org/${o.slug}`}
                    className="flex items-center gap-3 border-t border-line px-4 py-3 no-underline hover:bg-raise"
                  >
                    <LogoTile name={o.name} logoUrl={o.logoUrl} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-row-title truncate">{o.name}</span>
                      <span className="text-meta text-muted">{baseLabel(o)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-date text-[13px]">
                        {o.openCount.toLocaleString("en-GB")} open
                      </span>
                      <StatusBadge state={worstHealth(o.sources.map((s) => s.health))} />
                    </span>
                  </Link>
                ))}
              </section>
            ))}
          </RowList>
        ) : (
          <p className="text-body m-0 px-4 text-muted">No organisation is listed yet.</p>
        )}
        <p className="m-0 px-4 pt-4 pb-8 text-[12px] text-faint">
          Healthy: read without trouble. New: fewer than four reads so far. Stale: nothing new for
          longer than usual. Erroring: the last three reads failed.
        </p>
      </div>
    </main>
  );
}
