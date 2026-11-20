import type { Metadata } from "next";
import { ListEnding, StatusBadge } from "@/components/blocks";
import { SectionHeader } from "@/components/headers";
import { RowList } from "@/components/row-list";
import { StatusWord } from "@/components/status-word";
import { REPO_URL } from "@/data/site";
import { getStatus } from "@/data/status";
import { registryPath, SOURCE_KIND_LABEL } from "@/ui/org";
import { ago, byReadState, overview, READ_TONE, READ_WORD, readState } from "@/ui/status";
import { formatDate, sourceDomain } from "@/ui/time";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Status",
  description: "Whether every source was read on time, and which ones need attention.",
  alternates: { canonical: "/status" },
};

/** How many on-time sources the reader's list shows before sending them to the table. */
const ON_TIME_SHOWN = 7;

const TICK = { none: "bg-faint", amber: "bg-amber", red: "bg-red" };

function Figure({ value, label, tone }: { value: number; label: string; tone: keyof typeof TICK }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-countdown text-[30px] leading-8">{value.toLocaleString("en-GB")}</span>
      <span className="text-meta flex items-center gap-1.5 text-muted">
        <span aria-hidden="true" className={`h-3 w-0.5 ${TICK[tone]}`} />
        {label}
      </span>
    </div>
  );
}

const CELL = "border-t border-line px-3 py-2.5 text-left align-top";

/**
 * `/status`, board "Status · normal and degraded" (docs/01 §3). The top answers a reader's
 * question, is the data fresh, by time since each source's last good read. The table under
 * it answers a contributor's, which source is broken and how, with the engine's own states:
 * the same ones `pnpm engine health` prints.
 */
export default async function Status() {
  const now = new Date();
  const status = await getStatus({ now });
  const sources = status.sources.map((s) => ({ ...s, read: readState(s, now) }));
  const o = overview(status.sources, now);
  const listed = sources
    .filter((s) => s.read !== "off")
    .sort((a, b) => byReadState(a.read, b.read));
  const attention = listed.filter((s) => s.read !== "onTime");
  const shown = [
    ...attention,
    ...listed.filter((s) => s.read === "onTime").slice(0, ON_TIME_SHOWN),
  ];
  const more = listed.length - shown.length;

  return (
    <main className="mx-auto max-w-content md:px-2">
      <div className="max-w-[760px]">
        <section
          aria-labelledby="headline"
          className="flex flex-col gap-2.5 border-b border-line px-4 pt-6 pb-5"
        >
          <StatusWord tone={o.attention ? "red" : "none"}>{`${formatDate(now)} · WAT`}</StatusWord>
          <h1
            id="headline"
            className="m-0 text-[26px] leading-[31px] font-semibold tracking-[-0.03em] text-balance"
          >
            {o.headline}
          </h1>
          <p className="text-body m-0 text-muted">{o.summary}</p>
        </section>

        <div className="grid grid-cols-3 gap-2.5 border-b border-line px-4 pt-[18px] pb-5">
          <Figure value={o.onTime} label="On time" tone="none" />
          <Figure value={o.late} label="Late" tone="amber" />
          <Figure value={o.failing} label="Failing" tone="red" />
        </div>

        <section aria-labelledby="sources">
          <SectionHeader id="sources" title="Sources" />
          <p className="-mt-2 mb-3 px-4 text-[13px] text-muted">
            {listed.length.toLocaleString("en-GB")} in total
          </p>
          {shown.length ? (
            <RowList>
              {shown.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between gap-3 border-t border-line px-4 py-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[14px] font-[550]">{s.organization.name}</span>
                    <span className="text-date truncate text-faint">
                      {sourceDomain(s.url)} ·{" "}
                      {s.lastOkAt
                        ? `${s.read === "onTime" ? "read" : "last read"} ${ago(s.lastOkAt, now)}`
                        : "not read yet"}
                    </span>
                  </div>
                  <StatusWord tone={READ_TONE[s.read]}>{READ_WORD[s.read]}</StatusWord>
                </div>
              ))}
              {more > 0 ? (
                <ListEnding href="#all-sources" strong>
                  {more} more {more === 1 ? "source" : "sources"}
                </ListEnding>
              ) : null}
            </RowList>
          ) : (
            <p className="text-body m-0 px-4 text-muted">No source is set up yet.</p>
          )}
        </section>

        <section aria-labelledby="how" className="flex flex-col gap-2.5 px-4 pt-6 pb-2">
          <h2 id="how" className="text-section m-0">
            How this works
          </h2>
          <p className="text-body m-0 max-w-[68ch] text-muted">
            An engine reads each organisation's own page every six hours. A source is late after 8
            hours without a good read, and failing after 24 or after nine failed reads in a row.
          </p>
          <p className="text-body m-0 max-w-[68ch] text-muted">
            Listings from a late source stay up. Each one shows when it was last checked.
          </p>
          <dl className="m-0 mt-1 grid max-w-[420px] grid-cols-[1fr_auto] gap-x-6 text-[13px]">
            {(
              [
                ["Organisations", status.counts.organizations.toLocaleString("en-GB")],
                ["Sources", status.counts.sources.toLocaleString("en-GB")],
                ["Open opportunities", status.counts.openOpportunities.toLocaleString("en-GB")],
                ["Published this week", status.counts.publishedThisWeek.toLocaleString("en-GB")],
                [
                  "Engine last ran",
                  status.lastEngineRunAt ? ago(status.lastEngineRunAt, now) : "not yet",
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="border-t border-line py-2 text-muted">{label}</dt>
                <dd className="text-date m-0 border-t border-line py-2 text-right text-[13px]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <a
            href={`${REPO_URL}/issues/new`}
            target="_blank"
            rel="noopener"
            className="flex min-h-target w-fit items-center text-[14px] font-medium underline underline-offset-[3px]"
          >
            Report a problem on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </section>
      </div>

      <section
        id="all-sources"
        aria-labelledby="contributors"
        className="flex flex-col gap-2.5 px-4 pt-6 pb-10"
      >
        <h2 id="contributors" className="text-section m-0">
          For contributors
        </h2>
        <p className="text-body m-0 max-w-[68ch] text-muted">
          Every source, worst first, with the engine's own state. A stale or erroring source usually
          needs a new address or a repaired reader, which makes it a good first issue. Each
          organisation links to its registry file.
        </p>
        {/* A wide table scrolls sideways inside its own box. */}
        <section
          aria-label="All sources"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
          tabIndex={0}
          className="overflow-x-auto border-b border-line"
        >
          <table className="w-full min-w-[760px] border-collapse text-[13px]">
            <caption className="sr-only">Every source and its state, worst first</caption>
            <thead>
              <tr className="text-[12px] text-muted">
                {[
                  "Organisation",
                  "Source",
                  "Kind",
                  "Last good read",
                  "Last new item",
                  "Empty runs",
                  "State",
                ].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.key}>
                  <th scope="row" className={`${CELL} font-medium`}>
                    <a
                      href={`${REPO_URL}/blob/main/${registryPath(s.organization.slug)}`}
                      target="_blank"
                      rel="noopener"
                      className="underline underline-offset-[3px]"
                    >
                      {s.organization.name}
                    </a>
                  </th>
                  <td className={`${CELL} text-date text-[13px]`}>{s.key}</td>
                  <td className={CELL}>{SOURCE_KIND_LABEL[s.kind]}</td>
                  <td className={`${CELL} text-date text-[13px]`}>
                    {s.lastOkAt ? ago(s.lastOkAt, now) : "never"}
                  </td>
                  <td className={`${CELL} text-date text-[13px]`}>
                    {s.lastYieldAt ? ago(s.lastYieldAt, now) : "never"}
                  </td>
                  <td className={`${CELL} text-date text-[13px]`}>{s.consecutiveEmpty}</td>
                  <td className={CELL}>
                    <StatusBadge state={s.health} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  );
}
