import { describe, expect, it } from "vitest";
import {
  addMonths,
  byDay,
  calendarHref,
  currentMonth,
  dayKey,
  eventDayLabel,
  eventsHref,
  feedPath,
  filterLabel,
  monthKey,
  monthLabel,
  monthRange,
  monthSummary,
  monthWeeks,
  parseCalendarParams,
  parseMonth,
  relativeDay,
} from "@/ui/calendar";
import { feedIcs } from "@/ui/ics";
import { watDay } from "@/ui/time";
import { DATE_ONLY, dto, EVENT } from "./dto";

// Wed 4 Nov 2026, 13:00 in Lagos.
const NOW = new Date("2026-11-04T12:00:00Z");

describe("months", () => {
  it("the current month is Lagos's, not UTC's", () => {
    expect(currentMonth(NOW)).toEqual({ year: 2026, month: 11 });
    // 23:30 UTC on 30 Nov is already 1 Dec in Lagos.
    expect(currentMonth(new Date("2026-11-30T23:30:00Z"))).toEqual({ year: 2026, month: 12 });
  });

  it.each([
    ["2026-12", "2026-12"],
    ["2027-01", "2027-01"],
    ["2028-05", "2028-05"],
    // Past, beyond 18 months, or not a month: the current month.
    ["2026-10", "2026-11"],
    ["2028-06", "2026-11"],
    ["2026-13", "2026-11"],
    ["next", "2026-11"],
    [undefined, "2026-11"],
  ])("?month=%s shows %s", (value, shown) => {
    expect(monthKey(parseMonth(value, NOW))).toBe(shown);
  });

  it("steps across a year end and names months", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
    expect(monthLabel({ year: 2026, month: 11 })).toBe("November 2026");
  });

  it("a month runs from midnight in Lagos to the next month's", () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({
      from: new Date("2026-10-31T23:00:00Z"),
      to: new Date("2026-11-30T23:00:00Z"),
    });
  });

  it("weeks start on Monday and cover the month", () => {
    const weeks = monthWeeks({ year: 2026, month: 11 });
    // 1 Nov 2026 is a Sunday: the first week starts Mon 26 Oct; 30 Nov is a Monday.
    expect(weeks).toHaveLength(6);
    expect(dayKey(weeks[0]?.[0]?.day ?? 0)).toBe("2026-10-26");
    expect(weeks[0]?.map((c) => c.inMonth)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
    expect(dayKey(weeks[5]?.[0]?.day ?? 0)).toBe("2026-11-30");
    expect(weeks.flat().filter((c) => c.inMonth)).toHaveLength(30);
    // February 2027 starts on a Monday and has exactly four weeks.
    expect(monthWeeks({ year: 2027, month: 2 })).toHaveLength(4);
  });
});

describe("days", () => {
  const today = watDay(NOW);
  it("says how far off a day is", () => {
    expect(relativeDay(today, NOW)).toBe("Today");
    expect(relativeDay(today + 1, NOW)).toBe("Tomorrow");
    expect(relativeDay(today + 17, NOW)).toBe("In 17 days");
    expect(relativeDay(today - 1, NOW)).toBe("");
    expect(eventDayLabel(today + 2, NOW)).toEqual({ label: "In 2 days", date: "Fri 6 Nov 2026" });
    expect(eventDayLabel(today - 1, NOW).label).toBe("Under way");
  });

  it("puts a deadline on its day in Lagos and an event on its start; drops undated items", () => {
    const days = byDay([
      dto({ slug: "a" }),
      dto({ slug: "late", deadlineAt: "2026-11-05T22:30:00.000Z" }),
      dto({ slug: "date-only", deadlineAt: DATE_ONLY }),
      dto({ ...EVENT, slug: "event" }),
      dto({ slug: "rolling", deadlineKind: "rolling" }),
      dto({ slug: "unknown", deadlineKind: "unknown", deadlineAt: null }),
    ]);
    expect(days.map((d) => [dayKey(d.day), d.items.map((o) => o.slug)])).toEqual([
      ["2026-11-05", ["a", "late"]],
      ["2026-11-06", ["event"]],
      ["2026-11-07", ["date-only"]],
    ]);
  });

  it("summarises a month", () => {
    expect(monthSummary([dto(), dto(), dto(EVENT)])).toBe("2 deadlines · 1 event");
    expect(monthSummary([dto(EVENT)])).toBe("1 event");
    expect(monthSummary([])).toBe("Nothing dated this month");
  });
});

describe("addresses", () => {
  const parse = (q: string) => parseCalendarParams(Object.fromEntries(new URLSearchParams(q)), NOW);

  it("reads month, kinds, city and tags, ignoring what it does not understand", () => {
    expect(parse("month=2026-12&kinds=event,nonsense&city=lagos&tags=ml")).toEqual({
      month: { year: 2026, month: 12 },
      kinds: ["event"],
      city: "lagos",
      tags: ["ml"],
    });
    expect(parse("city=atlantis&month=x")).toEqual({
      month: { year: 2026, month: 11 },
      kinds: [],
      city: undefined,
      tags: [],
    });
  });

  it("writes the current month as the bare address and keeps filters", () => {
    expect(calendarHref({}, NOW)).toBe("/calendar");
    expect(calendarHref({ month: { year: 2026, month: 11 } }, NOW)).toBe("/calendar");
    expect(
      calendarHref({ month: { year: 2026, month: 12 }, kinds: ["hackathon", "competition"] }, NOW),
    ).toBe("/calendar?month=2026-12&kinds=hackathon,competition");
    expect(calendarHref({ kinds: ["event"], city: "lagos" }, NOW, "#subscribe")).toBe(
      "/calendar?kinds=event&city=lagos#subscribe",
    );
    expect(feedPath({})).toBe("/calendar.ics");
    expect(feedPath({ kinds: ["event"], city: "kano", tags: ["ml", "web"] })).toBe(
      "/calendar.ics?kinds=event&city=kano&tags=ml,web",
    );
    expect(eventsHref()).toBe("/events");
    expect(eventsHref({ city: "lagos" })).toBe("/events?city=lagos");
    expect(eventsHref({ cursor: "abc" })).toBe("/events?cursor=abc");
    expect(eventsHref({ city: "lagos", cursor: "abc" })).toBe("/events?city=lagos&cursor=abc");
  });

  it("names a filter", () => {
    expect(filterLabel([])).toBeNull();
    expect(filterLabel(["hackathon", "competition"])).toBe("Build");
    expect(filterLabel(["grant"])).toBe("Grants");
  });
});

describe("calendar feed", () => {
  const lines = (ics: string) => ics.replace(/\r\n /g, "").trimEnd().split("\r\n");

  it("holds one event per dated item, with no reminders, and asks to be re-read", () => {
    const ics = feedIcs(
      [dto(), dto({ ...EVENT, id: "opp_2" }), dto({ id: "opp_3", deadlineKind: "rolling" })],
      NOW,
      "devspot: Build",
    );
    const l = lines(ics);
    expect(l.slice(0, 8)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//devspot//opportunities//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:devspot: Build",
      "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
      "X-PUBLISHED-TTL:PT6H",
    ]);
    expect(l.at(-1)).toBe("END:VCALENDAR");
    expect(l.filter((x) => x === "BEGIN:VEVENT")).toHaveLength(2);
    expect(l.filter((x) => x.startsWith("UID:"))).toEqual([
      "UID:opp_1@devspot.test",
      "UID:opp_2@devspot.test",
    ]);
    expect(ics).not.toContain("VALARM");
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("an empty feed is still a valid calendar", () => {
    const l = lines(feedIcs([], NOW, "devspot"));
    expect(l[0]).toBe("BEGIN:VCALENDAR");
    expect(l.at(-1)).toBe("END:VCALENDAR");
    expect(l).not.toContain("BEGIN:VEVENT");
  });
});
