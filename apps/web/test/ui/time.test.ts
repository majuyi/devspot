import { describe, expect, it } from "vitest";
import { checkedAgo, daysBetween, formatDate, hasStatedTime, sourceDomain } from "@/ui/time";

// Wed 4 Nov 2026, 12:00 in Lagos.
const now = new Date("2026-11-04T11:00:00Z");

describe("formatDate", () => {
  it("writes weekday, day, month and year in Lagos time", () => {
    expect(formatDate(new Date("2026-10-03T10:00:00Z"))).toBe("Sat 3 Oct 2026");
  });

  it("adds the time in WAT only when the source gave one", () => {
    expect(formatDate(new Date("2026-11-05T03:45:00Z"), { time: true })).toBe(
      "Thu 5 Nov 2026, 04:45 WAT",
    );
    // 23:59 Lagos is how a date-only deadline is stored (docs/05 §1).
    expect(formatDate(new Date("2026-11-04T22:59:00Z"), { time: true })).toBe("Wed 4 Nov 2026");
  });

  it("drops the year on request, for group header ranges", () => {
    expect(formatDate(new Date("2026-11-11T11:00:00Z"), { year: false })).toBe("Wed 11 Nov");
  });

  it("uses the Lagos day, not the UTC day, near midnight", () => {
    // 23:30 UTC on the 4th is 00:30 on the 5th in Lagos.
    expect(formatDate(new Date("2026-11-04T23:30:00Z"))).toBe("Thu 5 Nov 2026");
  });
});

describe("hasStatedTime", () => {
  it("treats 23:59 in Lagos as no time given", () => {
    expect(hasStatedTime(new Date("2026-11-04T22:59:00Z"))).toBe(false);
    expect(hasStatedTime(new Date("2026-11-04T17:00:00Z"))).toBe(true);
  });
});

describe("daysBetween", () => {
  it("counts Lagos calendar days", () => {
    expect(daysBetween(now, new Date("2026-11-04T22:59:00Z"))).toBe(0);
    expect(daysBetween(now, new Date("2026-11-04T23:00:00Z"))).toBe(1);
    expect(daysBetween(now, new Date("2026-11-03T22:00:00Z"))).toBe(-1);
  });
});

describe("checkedAgo", () => {
  it.each([
    [30_000, "checked just now"],
    [12 * 60_000, "checked 12m ago"],
    [2 * 3_600_000 + 5 * 60_000, "checked 2h ago"],
    [3 * 86_400_000, "checked 3d ago"],
  ])("%i ms ago reads %s", (ms, text) => {
    expect(checkedAgo(new Date(now.getTime() - ms), now)).toBe(text);
  });
});

describe("sourceDomain", () => {
  it("is the host without www", () => {
    expect(sourceDomain("https://www.devpost.com/hackathons/x")).toBe("devpost.com");
    expect(sourceDomain("https://gdg.community.dev/events/1")).toBe("gdg.community.dev");
  });
});
