// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
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
import { KindTag } from "@/components/kind-tag";
import { CountdownColumn, LiveStatus } from "@/components/live";
import { LogoTile } from "@/components/logo-tile";
import { DatedRow, OpportunityRow, UndatedRow } from "@/components/rows";
import { SourceLine } from "@/components/source-line";
import { StatusWord } from "@/components/status-word";
import { render, text } from "./render";

// Wed 4 Nov 2026, 12:00 in Lagos.
const now = new Date("2026-11-04T11:00:00Z");
const serverNow = now.toISOString();
const r = rowFixtures(now);

describe("DatedRow", () => {
  it("shows countdown, kind, status, title, place, date, source and a calendar link", () => {
    const el = render(<DatedRow item={r.within48h} serverNow={serverNow} />);
    expect(text(el)).toContain("27h14m");
    expect(text(el)).toContain("Hackathon");
    expect(text(el)).toContain("Closes tomorrow");
    expect(text(el)).toContain("Girls Who Code HHS Hackathon 2026");
    expect(text(el)).toContain("Devpost · Remote");
    expect(text(el)).toContain("devpost.com · checked 2h ago");
    expect(el.querySelector('a[href="/o/gwc-hackathon"]')).not.toBeNull();
    const cal = el.querySelector('a[href="/o/gwc-hackathon/calendar.ics"]');
    expect(cal?.getAttribute("aria-label")).toBe(
      "Add Girls Who Code HHS Hackathon 2026 to calendar",
    );
  });

  it("colours the numeral by urgency", () => {
    expect(
      render(<DatedRow item={r.within48h} serverNow={serverNow} />).querySelector(".text-red"),
    ).not.toBeNull();
    expect(
      render(<DatedRow item={r.within7d} serverNow={serverNow} />).querySelector(".text-amber"),
    ).not.toBeNull();
  });

  it("says Today with no time for a date-only deadline today", () => {
    const el = render(<DatedRow item={r.todayNoTime} serverNow={serverNow} />);
    expect(text(el)).toContain("Today");
    expect(text(el)).toContain("Closes today");
    expect(text(el)).toContain("Wed 4 Nov 2026");
    expect(text(el)).not.toContain("WAT");
  });

  it("strikes the old date when the deadline moved", () => {
    const el = render(
      <DatedRow item={r.moved} serverNow={serverNow} previousDeadlineAt={r.movedFrom} />,
    );
    expect(text(el)).toContain("Deadline moved");
    expect(el.querySelector("del")?.textContent).toContain("Fri 13 Nov 2026");
  });

  it("shows the next round for multi-round items", () => {
    expect(text(render(<DatedRow item={r.multiRound} serverNow={serverNow} />))).toContain(
      "Multiple rounds, next: Fri 20 Nov 2026",
    );
  });

  it("greys a closed item: Closed, struck date, grey tag, no calendar link or source", () => {
    const el = render(<DatedRow item={r.closed} serverNow={serverNow} />);
    expect(text(el)).toContain("Closed");
    expect(el.querySelector("del")).not.toBeNull();
    expect(el.querySelector(".bg-raise.text-faint")?.textContent).toBe("Scholarship");
    expect(el.querySelector('a[href$="calendar.ics"]')).toBeNull();
  });

  it("counts days to an event and says Starts Fri", () => {
    const el = render(<DatedRow item={r.eventThisWeek} serverNow={serverNow} />);
    expect(text(el)).toContain("2d");
    expect(text(el)).toContain("Starts Fri");
    expect(text(el)).toContain("GDG Ilorin · Ilorin");
  });
});

describe("UndatedRow", () => {
  it("shows a monogram and Rolling applications", () => {
    const el = render(<UndatedRow item={r.rolling} serverNow={serverNow} />);
    expect(text(el)).toContain("Rolling applications");
    expect(text(el)).toContain("Example Org · Lagos · Hybrid");
    expect(el.querySelector('[aria-hidden="true"]')?.textContent).toBe("E");
  });

  it("says the deadline is not stated, never a guess", () => {
    const el = render(<UndatedRow item={r.notStated} serverNow={serverNow} />);
    expect(text(el)).toContain("Deadline not stated on the source page");
    expect(el.querySelector('a[href$="calendar.ics"]')).toBeNull();
  });
});

describe("OpportunityRow", () => {
  it("picks the dated row only when there is an instant to count down to", () => {
    expect(
      render(<OpportunityRow item={r.open} serverNow={serverNow} />).querySelector(
        'a[href$="calendar.ics"]',
      ),
    ).not.toBeNull();
    expect(
      render(<OpportunityRow item={r.rolling} serverNow={serverNow} />).querySelector(
        'a[href$="calendar.ics"]',
      ),
    ).toBeNull();
  });
});

describe("small parts", () => {
  it("CountdownColumn and LiveStatus render from the server clock", () => {
    expect(text(render(<CountdownColumn item={r.open} serverNow={serverNow} />))).toBe("88d9h");
    expect(text(render(<LiveStatus item={r.within7d} serverNow={serverNow} />))).toBe("Closes Sun");
  });

  it("KindTag shows the exact kind in its family tint", () => {
    const el = render(<KindTag kind="ossProgram" />);
    expect(text(el)).toBe("Open-source programme");
    expect(el.querySelector(".bg-k-prog-bg")).not.toBeNull();
  });

  it("StatusWord pairs a dot with the word", () => {
    const el = render(<StatusWord tone="amber">Closes Sat</StatusWord>);
    expect(el.querySelector(".text-amber")).not.toBeNull();
    expect(el.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("SourceLine omits the checked time when never verified", () => {
    expect(
      text(render(<SourceLine url="https://www.example.org/x" lastVerifiedAt={null} now={now} />)),
    ).toBe("example.org");
  });

  it("DeadlineText strikes a closed date", () => {
    expect(
      render(<DeadlineText at="2026-10-30T22:59:00Z" closed />).querySelector("del"),
    ).not.toBeNull();
  });

  it("LogoTile uses the logo when given, with empty alt", () => {
    expect(
      render(<LogoTile name="Kuda" logoUrl="https://example.org/k.svg" />)
        .querySelector("img")
        ?.getAttribute("alt"),
    ).toBe("");
    expect(text(render(<LogoTile name="paga" />))).toBe("P");
  });

  it("GroupHeader shows the label and range", () => {
    expect(text(render(<GroupHeader group="week" now={now} />))).toBe("This weekto Wed 11 Nov");
  });

  it("SectionHeader shows the link and note", () => {
    const el = render(
      <SectionHeader
        title="Closing soon"
        link={{ href: "/opportunities", label: "All 30 open" }}
        note="All 23 sources read."
      />,
    );
    expect(el.querySelector("h2")?.textContent).toBe("Closing soon");
    expect(el.querySelector('a[href="/opportunities"]')?.textContent).toBe("All 30 open");
  });

  it("PlacePill marks the selected place and reads its count", () => {
    const el = render(
      <PlacePill name="Lagos" count={5} tone="none" href="/?city=lagos" selected />,
    );
    expect(el.querySelector("a")?.getAttribute("aria-current")).toBe("true");
    expect(text(el)).toBe("Lagos, 5 open");
  });

  it("KindChip offers a clear when a family is selected", () => {
    expect(text(render(<KindChip family="build" href="/opportunities" selected />))).toBe(
      "Build, clear",
    );
    expect(text(render(<KindChip family="all" href="/opportunities" selected />))).toBe("All");
  });

  it("StatusFigure formats the number", () => {
    expect(text(render(<StatusFigure value={1240} label="open" tone="none" href="/" />))).toBe(
      "1,240open",
    );
  });

  it("RequirementsBlock is verbatim, or says the source lists none", () => {
    const el = render(<RequirementsBlock orgName="Paystack" text={"Line one\nLine two"} />);
    expect(el.querySelector("h2")?.textContent).toBe("Requirements, as stated by Paystack");
    expect(el.querySelector("p")?.textContent).toBe("Line one\nLine two");
    expect(text(render(<RequirementsBlock orgName="Paystack" text={null} />))).toContain(
      "The source does not list requirements.",
    );
  });

  it("StatusBadge, ListEnding, EmptyState, buttons and Sheet render", () => {
    expect(text(render(<StatusBadge state="erroring" />))).toBe("Erroring");
    expect(
      text(render(<ListEnding href="/opportunities?city=lagos">2 more in Lagos</ListEnding>)),
    ).toBe("2 more in Lagos");
    expect(
      render(
        <EmptyState message="Nothing here." action={{ href: "/", label: "View all" }} />,
      ).querySelector('a[href="/"]'),
    ).not.toBeNull();
    expect(render(<ButtonLink href="/x">Go</ButtonLink>).querySelector("a")?.textContent).toBe(
      "Go",
    );
    expect(render(<Button disabled>Go</Button>).querySelector("button")?.disabled).toBe(true);
    expect(
      render(
        <IconLink href="#" label="Add to calendar">
          x
        </IconLink>,
      )
        .querySelector("a")
        ?.getAttribute("aria-label"),
    ).toBe("Add to calendar");
    expect(text(render(<Sheet>content</Sheet>))).toBe("content");
  });
});

describe("copy rules", () => {
  it("no component says a reader is eligible", () => {
    const all = Object.values(r)
      .filter((v) => typeof v === "object")
      .map((item) =>
        text(render(<OpportunityRow item={item as typeof r.open} serverNow={serverNow} />)),
      )
      .join(" ");
    expect(all).not.toMatch(/eligib|you qualify|perfect for you/i);
  });
});
