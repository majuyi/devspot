import type { ReactNode } from "react";
import { GROUP_LABEL, GROUP_TONE, type Group, groupOf, groupRange } from "@/ui/urgency";
import { BandHeader } from "./headers";
import { OpportunityRow, type RowItem } from "./rows";

/** The rule under the last row closes a list (boards: every list ends on a line). */
export function RowList({ children }: { children: ReactNode }) {
  return <div className="flex flex-col border-b border-line">{children}</div>;
}

/** Rows in the order given, no bands: "New this week", "Near you", `sort=new`. */
export function Rows({ items, serverNow }: { items: RowItem[]; serverNow: string }) {
  return items.map((item) => <OpportunityRow key={item.slug} item={item} serverNow={serverNow} />);
}

type Band = Group | "past" | "none";

/**
 * The list's sort key, which is what a band must follow or bands would repeat.
 * `deadline`: sorted by `deadlineAt`; an event with no deadline sits in the undated tail.
 * `start`: events sorted by `startsAt`, banded This week and Later (docs/01 §3).
 */
type By = "deadline" | "start";

function bandOf(item: RowItem, now: Date, by: By): Band {
  const key = by === "start" ? item.startsAt : item.deadlineAt;
  if (!key) return "none";
  const at = new Date(key);
  if (by === "start") return groupOf(at, now) === "later" ? "later" : "week";
  // Closed, or due but not yet re-checked: never under "Today".
  if (item.status === "closed" || at.getTime() <= now.getTime()) return "past";
  return groupOf(at, now);
}

function Header({ band, now, by }: { band: Band; now: Date; by: By }) {
  if (band === "past") return <BandHeader label="Deadline passed" tone="closed" />;
  if (band === "none") {
    return (
      <BandHeader label={by === "start" ? "Date not stated" : "No closing date"} tone="none" />
    );
  }
  return (
    <BandHeader label={GROUP_LABEL[band]} tone={GROUP_TONE[band]} range={groupRange(band, now)} />
  );
}

/** Rows under a band each time the band changes; the caller supplies the order. */
export function GroupedRows({
  items,
  serverNow,
  by = "deadline",
}: {
  items: RowItem[];
  serverNow: string;
  by?: By;
}) {
  const now = new Date(serverNow);
  let previous: Band | undefined;
  return items.map((item) => {
    const band = bandOf(item, now, by);
    const header = band === previous ? null : <Header band={band} now={now} by={by} />;
    previous = band;
    return (
      <div key={item.slug} className="contents">
        {header}
        <OpportunityRow item={item} serverNow={serverNow} />
      </div>
    );
  });
}
