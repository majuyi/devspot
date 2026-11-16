import type { OpportunityDto } from "@devspot/schema";
import { DAY, HOUR } from "@/data/time";
import { placeLabel } from "./place";
import { formatDate, hasStatedTime } from "./time";
import { target } from "./urgency";

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are escaped in TEXT. */
const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, ";").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** §3.1: lines are at most 75 octets; longer ones continue on a line starting with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    // Continuation lines spend one octet on the leading space.
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const utc = (d: Date) => `${d.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;

/** The calendar date in Lagos (UTC+1 all year) as YYYYMMDD. */
const watDate = (d: Date) =>
  new Date(d.getTime() + HOUR).toISOString().slice(0, 10).replace(/-/g, "");

/**
 * One VEVENT for an opportunity (docs/06 §3), or null when it has no date to put in a
 * calendar. A deadline is an hour ending at the deadline, so it sits before the moment and
 * not after it; with only a date stated it is an all-day entry. An event keeps its own
 * times. Each has one reminder the day before.
 */
export function opportunityIcs(o: OpportunityDto, now: Date): string | null {
  const t = target(o);
  if (!t) return null;
  const host = new URL(o.url).host;
  const allDay = !hasStatedTime(t.at);
  const when: string[] = [];
  if (allDay) {
    when.push(`DTSTART;VALUE=DATE:${watDate(t.at)}`);
    const end = t.mode === "start" && o.endsAt ? new Date(o.endsAt) : t.at;
    // DTEND is exclusive for all-day entries.
    when.push(`DTEND;VALUE=DATE:${watDate(new Date(end.getTime() + DAY))}`);
  } else if (t.mode === "deadline") {
    when.push(`DTSTART:${utc(new Date(t.at.getTime() - HOUR))}`, `DTEND:${utc(t.at)}`);
  } else {
    when.push(`DTSTART:${utc(t.at)}`);
    if (o.endsAt && new Date(o.endsAt) > t.at) when.push(`DTEND:${utc(new Date(o.endsAt))}`);
  }
  const deadline = t.mode === "deadline";
  const summary = deadline ? `Deadline: ${o.title}` : o.title;
  const date = formatDate(t.at, { time: true });
  const description = [
    `${deadline ? "Closes" : "Starts"} ${date}.`,
    `${o.organization.name} · ${placeLabel(o)}`,
    `${deadline ? "Apply" : "Details"}: ${o.applyUrl ?? o.canonicalUrl}`,
    `Listed at ${o.url}`,
    "Check the source page before you rely on this date.",
  ].join("\n");
  const venue = [o.venue?.name, o.venue?.address].filter(Boolean).join(", ");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//devspot//opportunities//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${o.id}@${host}`,
    `DTSTAMP:${utc(now)}`,
    ...when,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `URL:${o.url}`,
    ...(!deadline && venue ? [`LOCATION:${esc(venue)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(summary)}`,
    // An all-day entry starts at midnight, so 15 hours before is 09:00 the day before.
    `TRIGGER:${allDay ? "-PT15H" : "-P1D"}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
