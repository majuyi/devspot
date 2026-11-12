import type { OpportunityKind } from "@devspot/schema";
import type { ReactNode } from "react";
import {
  Button,
  ButtonLink,
  EmptyState,
  IconLink,
  ListEnding,
  RequirementsBlock,
  Sheet,
  StatusBadge,
} from "@/components/blocks";
import { DeadlineText } from "@/components/deadline-text";
import { KindChip, PlacePill, StatusFigure } from "@/components/filters";
import { rowFixtures } from "@/components/fixtures";
import { GroupHeader, SectionHeader } from "@/components/headers";
import { CalendarAddIcon } from "@/components/icons";
import { KindTag } from "@/components/kind-tag";
import { LogoTile } from "@/components/logo-tile";
import { DatedRow, UndatedRow } from "@/components/rows";
import { StatusWord } from "@/components/status-word";
import { FAMILIES, kindsOf } from "@/ui/kind";

const KINDS: OpportunityKind[] = [
  "job",
  "internship",
  "hackathon",
  "competition",
  "event",
  "scholarship",
  "grant",
  "fellowship",
  "bootcamp",
  "ossProgram",
  "accelerator",
];

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-4 pt-6 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Every component from docs/07 §5 in each state on the boards. The axe test renders it. */
export function ComponentsGallery({ now }: { now: Date }) {
  const serverNow = now.toISOString();
  const r = rowFixtures(now);
  return (
    <main className="mx-auto flex max-w-[480px] flex-col pb-8">
      <h1 className="text-page-title px-4 pt-6">Components</h1>

      <Part title="Rows">
        <div className="flex flex-col border-b border-line">
          <DatedRow item={r.within48h} serverNow={serverNow} />
          <DatedRow item={r.todayNoTime} serverNow={serverNow} />
          <DatedRow item={r.within7d} serverNow={serverNow} />
          <DatedRow item={r.open} serverNow={serverNow} />
          <DatedRow item={r.moved} serverNow={serverNow} previousDeadlineAt={r.movedFrom} />
          <DatedRow item={r.multiRound} serverNow={serverNow} />
          <DatedRow item={r.closed} serverNow={serverNow} />
          <UndatedRow item={r.rolling} serverNow={serverNow} />
          <UndatedRow item={r.notStated} serverNow={serverNow} />
          <DatedRow item={r.eventThisWeek} serverNow={serverNow} />
          <DatedRow item={r.eventScheduled} serverNow={serverNow} />
        </div>
      </Part>

      <Part title="List endings">
        <div className="flex flex-col border-b border-line">
          <ListEnding href="/opportunities?org=devpost">1 more from Devpost this month</ListEnding>
          <ListEnding href="/opportunities?city=lagos" strong>
            2 more in Lagos
          </ListEnding>
        </div>
      </Part>

      <Part title="Section and group headers">
        <div className="flex flex-col">
          <SectionHeader
            title="Closing soon"
            link={{ href: "/opportunities", label: "All 30 open" }}
            note="All 23 sources read in the last 6 hours."
          />
          <GroupHeader group="today" now={now} />
          <GroupHeader group="tomorrow" now={now} />
          <GroupHeader group="week" now={now} />
          <GroupHeader group="later" now={now} />
        </div>
      </Part>

      <Part title="Place pills">
        <nav aria-label="Places (example)" className="flex flex-wrap gap-2 px-4">
          <PlacePill name="Remote" count={30} tone="red" href="/?city=remote" />
          <PlacePill name="Lagos" count={5} tone="none" href="/?city=lagos" selected />
          <PlacePill name="Ilorin" count={1} tone="amber" href="/?city=ilorin" />
          <PlacePill name="Port Harcourt" count={1} tone="none" href="/?city=port-harcourt" />
        </nav>
      </Part>

      <Part title="Kind filter">
        <nav aria-label="Kinds (example)" className="flex flex-wrap gap-2 px-4">
          <KindChip family="all" href="/opportunities" selected />
          {FAMILIES.map((f) => (
            <KindChip key={f} family={f} href={`/opportunities?kinds=${kindsOf(f).join(",")}`} />
          ))}
          <KindChip family="build" href="/opportunities" selected />
        </nav>
      </Part>

      <Part title="Kind tags">
        <div className="flex flex-wrap gap-1.5 px-4">
          {KINDS.map((k) => (
            <KindTag key={k} kind={k} />
          ))}
          <KindTag kind="scholarship" closed />
        </div>
      </Part>

      <Part title="Status words">
        <div className="grid grid-cols-2 gap-3 px-4">
          <StatusWord tone="red">Closes today, 18:00</StatusWord>
          <StatusWord tone="red">Closes tomorrow</StatusWord>
          <StatusWord tone="amber">Closes Sat</StatusWord>
          <StatusWord tone="none">Open</StatusWord>
          <StatusWord tone="none">Rolling applications</StatusWord>
          <StatusWord tone="closed">Closed</StatusWord>
          <StatusWord tone="amber">Starts Fri</StatusWord>
          <StatusWord tone="none">Scheduled</StatusWord>
          <StatusWord tone="none">Deadline moved</StatusWord>
        </div>
      </Part>

      <Part title="Deadline moved">
        <div className="px-4">
          <DeadlineText at={r.moved.deadlineAt as string} previous={r.movedFrom} />
        </div>
      </Part>

      <Part title="Status figures">
        <div className="flex gap-[22px] px-4">
          <StatusFigure value={1240} label="open" tone="none" href="/opportunities" />
          <StatusFigure value={86} label="this week" tone="amber" href="/opportunities?closing=7" />
          <StatusFigure value={9} label="48 hours" tone="red" href="/opportunities?closing=2" />
        </div>
      </Part>

      <Part title="Logo tile and monogram">
        <div className="flex gap-3 px-4">
          <LogoTile name="Kuda" />
          <LogoTile name="Paga" />
        </div>
      </Part>

      <Part title="Buttons">
        <div className="flex flex-wrap items-center gap-3 px-4">
          <ButtonLink href="/opportunities">Apply on devpost.com</ButtonLink>
          <ButtonLink href="/opportunities" variant="secondary">
            Share
          </ButtonLink>
          <Button variant="ghost">Load more</Button>
          <Button disabled>Disabled</Button>
          <IconLink href="#" label="Add to calendar">
            <CalendarAddIcon />
          </IconLink>
        </div>
      </Part>

      <Part title="Requirements">
        <div className="flex flex-col gap-3 px-4">
          <RequirementsBlock
            orgName="Example Org"
            text={"Open to final-year students.\nApplicants must submit a portfolio."}
          />
          <RequirementsBlock orgName="Another Org" text={null} />
        </div>
      </Part>

      <Part title="Source health">
        <div className="flex flex-wrap gap-4 px-4">
          <StatusBadge state="healthy" />
          <StatusBadge state="stale" />
          <StatusBadge state="erroring" />
          <StatusBadge state="new" />
          <StatusBadge state="disabled" />
        </div>
      </Part>

      <Part title="Empty state">
        <EmptyState
          message="Nothing open in Kano right now."
          action={{ href: "/opportunities", label: "See every city" }}
        />
      </Part>

      <Part title="Sheet over a band">
        <div className="bg-sea px-4 pt-6 pb-8 text-meta text-muted">Band</div>
        <Sheet>
          <p className="text-body m-0 p-4">Sheet content</p>
        </Sheet>
      </Part>
    </main>
  );
}
