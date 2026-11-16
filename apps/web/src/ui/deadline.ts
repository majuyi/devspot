import type { OpportunityDto } from "@devspot/schema";
import { formatDate, hasStatedTime, time } from "./time";
import { target } from "./urgency";

/** What the Deadline section of `/o/[slug]` says (board "Opportunity page", docs/01 §1). */
export type DeadlineView =
  | {
      type: "dated";
      /** "Closes", "Starts", "Multiple rounds, next". */
      label: string;
      /** The full date with the year, `Thu 5 Nov 2026`. */
      date: string;
      /** The large figure: the time when the source gave one, otherwise the day. */
      figure: string;
      /** "WAT" beside a time. */
      unit: string | null;
      /** One line for a share image or a description: `Closes Thu 5 Nov 2026, 04:45 WAT`. */
      line: string;
    }
  | { type: "undated"; headline: string; note: string; line: string };

const CHECKED = "We check the page every six hours and mark it closed when it goes.";

export function deadlineView(o: OpportunityDto): DeadlineView {
  const t = target(o);
  if (t) {
    const label =
      t.mode === "start"
        ? "Starts"
        : o.deadlineKind === "multiRound"
          ? "Multiple rounds, next"
          : "Closes";
    const stated = hasStatedTime(t.at);
    const full = formatDate(t.at, { time: true });
    return {
      type: "dated",
      label,
      date: formatDate(t.at),
      figure: stated ? time(t.at) : formatDate(t.at, { year: false }),
      unit: stated ? "WAT" : null,
      line: `${label} ${full}`,
    };
  }
  if (o.kind === "event") {
    return {
      type: "undated",
      headline: "Date not stated on the source page",
      note: CHECKED,
      line: "Date not stated on the source page",
    };
  }
  if (o.deadlineKind === "rolling") {
    return {
      type: "undated",
      headline: "Rolling applications",
      note: `The source gives no closing date, so this can close without notice. ${CHECKED}`,
      line: "Rolling applications",
    };
  }
  if (o.deadlineKind === "multiRound") {
    return {
      type: "undated",
      headline: "Multiple rounds",
      note: `The next date is not stated on the source page. ${CHECKED}`,
      line: "Multiple rounds",
    };
  }
  return {
    type: "undated",
    headline: "Not stated on the source page",
    note: `Listings like this can close without notice. ${CHECKED}`,
    line: "Deadline not stated on the source page",
  };
}

/** "Applications closed on Thu 5 Nov 2026", from when we saw it close, else its deadline. */
export function closedLine(o: OpportunityDto): string {
  const at = o.closedAt ?? o.deadlineAt;
  const what = o.kind === "event" ? "This event has ended" : "Applications closed";
  if (!at || o.kind === "event") return what;
  return `${what} on ${formatDate(new Date(at))}`;
}

/** "Apply on devpost.com"; an event may take no applications, so it is "View on". */
export function actionLabel(o: OpportunityDto): string {
  const host = new URL(o.applyUrl ?? o.canonicalUrl).hostname.replace(/^www\./, "");
  return `${o.kind === "event" || o.status === "closed" ? "View" : "Apply"} on ${host}`;
}
