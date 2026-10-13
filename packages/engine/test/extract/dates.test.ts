import { describe, expect, it } from "vitest";
import { findDates, zonedTime } from "../../src/extract/dates.js";

const REF = new Date("2026-10-13T12:00:00Z");

describe("findDates", () => {
  it.each([
    // [text, ISO instant, zone, hasYear, hasTime]
    ["Applications close 31 October 2026.", "2026-10-31T22:59:00.000Z", undefined, true, false],
    ["31st Oct, 2026", "2026-10-31T22:59:00.000Z", undefined, true, false],
    [
      "Friday, 31 October 2026 at 11:59pm WAT",
      "2026-10-31T22:59:00.000Z",
      "Africa/Lagos",
      true,
      true,
    ],
    ["Nov 12, 2026 @ 12:00pm PST", "2026-11-12T20:00:00.000Z", "America/Los_Angeles", true, true],
    ["Oct 23, 2026 @ 12:00pm PDT", "2026-10-23T19:00:00.000Z", "America/Los_Angeles", true, true],
    ["Oct 15, 2026 @ 12:15am IST", "2026-10-14T18:45:00.000Z", "Asia/Kolkata", true, true],
    ["March 31, 2026 at 18:00 UTC", "2026-03-31T18:00:00.000Z", "UTC", true, true],
    ["9th October 2026, 5:00 PM WAT", "2026-10-09T16:00:00.000Z", "Africa/Lagos", true, true],
    ["31 Oct 2026 23:59 GMT+1", "2026-10-31T22:59:00.000Z", "Etc/GMT-1", true, true],
    ["03/10/2026", "2026-10-03T22:59:00.000Z", undefined, true, false],
    ["2026-10-31", "2026-10-31T22:59:00.000Z", undefined, true, false],
    ["2026-10-31T09:30", "2026-10-31T08:30:00.000Z", undefined, true, true],
    ["3 March", "2027-03-03T22:59:00.000Z", undefined, false, false],
    ["October 20", "2026-10-20T22:59:00.000Z", undefined, false, false],
  ])("%s", (text, at, zone, hasYear, hasTime) => {
    const [d] = findDates(text, REF);
    expect(d?.at.toISOString()).toBe(at);
    expect(d?.zone).toBe(zone);
    expect(d?.hasYear).toBe(hasYear);
    expect(d?.hasTime).toBe(hasTime);
  });

  it.each([
    "the 2026 programme",
    "30 February 2027",
    "32 October 2026",
    "Version 2.10.2026",
    "We have 31 members",
    "13/31/2026",
  ])("finds no date in %j", (text) => {
    expect(findDates(text, REF)).toEqual([]);
  });

  it("keeps both ends of a range as separate dates", () => {
    const found = findDates("Cohort 1: 25 January – 5 March 2027", REF);
    expect(found.map((d) => d.quote)).toEqual(["25 January", "5 March 2027"]);
  });

  it("reads a date with no time as the start of the day when asked", () => {
    const [d] = findDates("3 October 2026", REF, { endOfDay: false });
    expect(d?.at.toISOString()).toBe("2026-10-02T23:00:00.000Z");
  });

  it("puts a missing year on or after the reference date", () => {
    const [d] = findDates("Oct 13", REF);
    expect(d?.at.toISOString()).toBe("2026-10-13T22:59:00.000Z");
    const [past] = findDates("Oct 12", REF);
    expect(past?.at.toISOString()).toBe("2027-10-12T22:59:00.000Z");
  });
});

describe("zonedTime", () => {
  it("handles daylight saving on both sides of the change", () => {
    expect(zonedTime(2026, 3, 7, 12, 0, "America/Los_Angeles").toISOString()).toBe(
      "2026-03-07T20:00:00.000Z",
    );
    expect(zonedTime(2026, 3, 9, 12, 0, "America/Los_Angeles").toISOString()).toBe(
      "2026-03-09T19:00:00.000Z",
    );
    // Hours after the change but before its UTC instant: one pass would use the old offset.
    expect(zonedTime(2026, 3, 8, 5, 0, "America/Los_Angeles").toISOString()).toBe(
      "2026-03-08T12:00:00.000Z",
    );
    expect(zonedTime(2026, 7, 1, 23, 59, "Africa/Lagos").toISOString()).toBe(
      "2026-07-01T22:59:00.000Z",
    );
  });
});
