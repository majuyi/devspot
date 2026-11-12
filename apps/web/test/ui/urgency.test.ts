import { describe, expect, it } from "vitest";
import { countdown, groupOf, groupRange, statusWord, type Timed, tone } from "@/ui/urgency";

// Wed 4 Nov 2026, 12:00 in Lagos.
const now = new Date("2026-11-04T11:00:00Z");
const H = 3_600_000;
const D = 24 * H;
const at = (ms: number) => new Date(now.getTime() + ms);

const deadline = (ms: number, over: Partial<Timed> = {}): Timed => ({
  kind: "hackathon",
  status: "published",
  deadlineAt: at(ms).toISOString(),
  deadlineKind: "fixed",
  startsAt: null,
  ...over,
});

describe("countdown (docs/07 §6)", () => {
  it.each([
    [38 * 60_000, { main: "38m" }],
    [27 * H + 14 * 60_000, { main: "27h", sub: "14m" }],
    [3 * D + 19 * H, { main: "3d", sub: "19h" }],
    [88 * D + 9 * H, { main: "88d", sub: "9h" }],
    [130 * D, { main: "4mo" }],
  ])("%i ms reads %o", (ms, expected) => {
    expect(countdown(at(ms), now)).toEqual(expected);
  });

  it("says Today for a date-only deadline later today", () => {
    expect(countdown(new Date("2026-11-04T22:59:00Z"), now)).toEqual({ main: "Today" });
  });

  it("is null once the deadline has passed", () => {
    expect(countdown(at(-60_000), now)).toBeNull();
  });

  it("counts calendar days to an event's start", () => {
    expect(countdown(new Date("2026-11-06T22:59:00Z"), now, "start")).toEqual({ main: "2d" });
    expect(countdown(new Date("2026-11-04T17:00:00Z"), now, "start")).toEqual({ main: "Today" });
  });
});

describe("tone", () => {
  it("is red within 48 hours, amber within 7 days, neutral after", () => {
    expect(tone(deadline(47 * H), now)).toBe("red");
    expect(tone(deadline(49 * H), now)).toBe("amber");
    expect(tone(deadline(8 * D), now)).toBe("none");
  });

  it("is closed for a closed item or a passed deadline", () => {
    expect(tone(deadline(D, { status: "closed" }), now)).toBe("closed");
    expect(tone(deadline(-H), now)).toBe("closed");
  });

  it("is amber for an event starting within 7 days, never red", () => {
    const event = {
      ...deadline(0),
      kind: "event" as const,
      deadlineAt: null,
      startsAt: at(H).toISOString(),
    };
    expect(tone(event, now)).toBe("amber");
  });

  it("is neutral with nothing to count down to", () => {
    expect(tone(deadline(D, { deadlineKind: "rolling" }), now)).toBe("none");
  });
});

describe("statusWord", () => {
  it.each([
    [deadline(6 * H), "Closes today, 18:00"],
    [{ ...deadline(0), deadlineAt: "2026-11-04T22:59:00Z" }, "Closes today"],
    [deadline(D), "Closes tomorrow"],
    [deadline(3 * D), "Closes Sat"],
    [deadline(20 * D), "Open"],
    [deadline(D, { status: "closed" }), "Closed"],
    [deadline(-H), "Closed"],
    [deadline(D, { deadlineKind: "rolling", deadlineAt: null }), "Rolling applications"],
  ] as const)("%o reads %s", (item, word) => {
    expect(statusWord(item, now)).toBe(word);
  });

  it("has no word when the deadline is not stated", () => {
    expect(statusWord(deadline(0, { deadlineKind: "unknown", deadlineAt: null }), now)).toBeNull();
  });

  it("says Starts Fri or Scheduled for events", () => {
    const event = (iso: string): Timed => ({
      kind: "event",
      status: "published",
      deadlineAt: null,
      deadlineKind: "unknown",
      startsAt: iso,
    });
    expect(statusWord(event("2026-11-06T09:00:00Z"), now)).toBe("Starts Fri");
    expect(statusWord(event("2026-11-21T09:00:00Z"), now)).toBe("Scheduled");
  });
});

describe("groups", () => {
  it("files items under Today, Tomorrow, This week and Later by Lagos day", () => {
    expect(groupOf(new Date("2026-11-04T22:59:00Z"), now)).toBe("today");
    expect(groupOf(new Date("2026-11-05T03:45:00Z"), now)).toBe("tomorrow");
    expect(groupOf(new Date("2026-11-11T20:00:00Z"), now)).toBe("week");
    expect(groupOf(new Date("2026-11-12T09:00:00Z"), now)).toBe("later");
  });

  it("labels the ranges as on board D", () => {
    expect(groupRange("today", now)).toBe("Wed 4 Nov 2026");
    expect(groupRange("tomorrow", now)).toBe("Thu 5 Nov 2026");
    expect(groupRange("week", now)).toBe("to Wed 11 Nov");
    expect(groupRange("later", now)).toBe("from Thu 12 Nov");
  });
});
