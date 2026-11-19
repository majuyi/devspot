import { describe, expect, it } from "vitest";
import {
  diff,
  type Editable,
  InvalidForm,
  lagosInputs,
  lagosInstant,
  parseEditable,
  publishBlockers,
  safeBack,
} from "@/admin/form";
import { highlight } from "@/admin/highlight";
import { hasStatedTime } from "@/ui/time";

const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
const BASE = { title: "iOS Engineer", deadlineKind: "unknown" };

describe("dates in the review form: as stated, in Lagos time", () => {
  it("a date and a time is that instant in Lagos", () => {
    expect(lagosInstant("2026-11-05", "04:45", "Deadline")?.toISOString()).toBe(
      "2026-11-05T03:45:00.000Z",
    );
    // Midnight in Lagos is the day before in UTC.
    expect(lagosInstant("2026-11-05", "00:00", "Deadline")?.toISOString()).toBe(
      "2026-11-04T23:00:00.000Z",
    );
  });

  it("a date with no time is stored as 23:59 that day and shown with no time", () => {
    const at = lagosInstant("2026-11-07", "", "Deadline") as Date;
    expect(at.toISOString()).toBe("2026-11-07T22:59:00.000Z");
    expect(hasStatedTime(at)).toBe(false);
    expect(lagosInputs(at)).toEqual({ date: "2026-11-07", time: "" });
  });

  it("round-trips a stored instant through the two inputs", () => {
    const at = new Date("2026-11-05T03:45:00.000Z");
    const v = lagosInputs(at);
    expect(v).toEqual({ date: "2026-11-05", time: "04:45" });
    expect(lagosInstant(v.date, v.time, "x")).toEqual(at);
    expect(lagosInputs(null)).toEqual({ date: "", time: "" });
    expect(lagosInstant("", "", "x")).toBeNull();
  });

  it("refuses a time with no date, and nonsense", () => {
    expect(() => lagosInstant("", "10:00", "Opens")).toThrow(InvalidForm);
    expect(() => lagosInstant("5 Nov", "", "Opens")).toThrow(InvalidForm);
  });
});

describe("the review form", () => {
  it("reads every field, trimming edges and normalising lists", () => {
    const e = parseEditable(
      form({
        title: "  iOS Engineer ",
        kind: "job",
        summary: "Build the app.",
        applyUrl: "https://kuda.com/apply",
        deadlineKind: "fixed",
        deadlineAtDate: "2026-11-05",
        deadlineAtTime: "04:45",
        deadlineTimezone: "Africa/Lagos",
        opensAtDate: "2026-10-01",
        locationMode: "hybrid",
        country: "ng",
        city: "lagos",
        venueName: "HQ",
        regionsTags: "Nigeria, west-africa",
        requirementsText: "  Line one.\r\n- Must hold a 2:1  ",
        tags: ["ml", "made-up", "women-in-tech"],
      }),
    );
    expect(e).toEqual({
      title: "iOS Engineer",
      kind: "job",
      summary: "Build the app.",
      applyUrl: "https://kuda.com/apply",
      opensAt: new Date("2026-10-01T22:59:00.000Z"),
      deadlineAt: new Date("2026-11-05T03:45:00.000Z"),
      deadlineKind: "fixed",
      deadlineTimezone: "Africa/Lagos",
      startsAt: null,
      endsAt: null,
      locationMode: "hybrid",
      country: "NG",
      city: "lagos",
      venueName: "HQ",
      venueAddress: null,
      regionsTags: ["nigeria", "west-africa"],
      // Verbatim inside: only the form's outer whitespace and CRLF go.
      requirementsText: "Line one.\n- Must hold a 2:1",
      tags: ["ml", "women-in-tech"],
    });
  });

  it("empty fields are null, never empty strings or guesses", () => {
    expect(parseEditable(form(BASE))).toMatchObject({
      kind: null,
      summary: null,
      applyUrl: null,
      deadlineAt: null,
      deadlineKind: "unknown",
      locationMode: null,
      country: null,
      city: null,
      requirementsText: null,
      tags: [],
    });
  });

  it.each([
    [{ title: " " }, /Title: required/],
    // Never guess a date: a date only with a kind that has one, and a fixed kind needs it.
    [{ ...BASE, deadlineAtDate: "2026-11-05" }, /"unknown" deadline has no date/],
    [
      { ...BASE, deadlineKind: "rolling", deadlineAtDate: "2026-11-05" },
      /"rolling" deadline has no date/,
    ],
    [{ ...BASE, deadlineKind: "fixed" }, /fixed deadline needs the date/],
    [{ ...BASE, kind: "wizard" }, /Kind: "wizard" is not one of the choices/],
    [{ ...BASE, city: "atlantis" }, /City/],
    [{ ...BASE, country: "Nigeria" }, /Country: two letters/],
    [{ ...BASE, applyUrl: "javascript:alert(1)" }, /Apply link: not a web address/],
    [{ ...BASE, locationMode: "remote", city: "lagos" }, /remote item has no city/],
    [{ ...BASE, summary: "x".repeat(281) }, /at most 280/],
  ])("%o is refused", (fields, message) => {
    expect(() => parseEditable(form(fields))).toThrow(message);
    expect(() => parseEditable(form(fields))).toThrow(InvalidForm);
  });

  it("multiple rounds may have a next date or none", () => {
    expect(parseEditable(form({ ...BASE, deadlineKind: "multiRound" })).deadlineAt).toBeNull();
    expect(
      parseEditable(form({ ...BASE, deadlineKind: "multiRound", deadlineAtDate: "2026-12-01" }))
        .deadlineAt,
    ).not.toBeNull();
  });

  it("says what a row needs before it can be published", () => {
    expect(publishBlockers({ kind: "job", locationMode: "remote" })).toEqual([]);
    expect(publishBlockers({ kind: null, locationMode: null })).toHaveLength(2);
  });

  it("the history records only the fields that changed, from and to", () => {
    const before = parseEditable(form({ ...BASE, kind: "job", tags: ["ml"] })) as Editable;
    const after = parseEditable(
      form({
        ...BASE,
        kind: "internship",
        tags: ["ml"],
        deadlineKind: "fixed",
        deadlineAtDate: "2026-11-05",
      }),
    );
    expect(diff(before, after)).toEqual({
      kind: { from: "job", to: "internship" },
      deadlineKind: { from: "unknown", to: "fixed" },
      deadlineAt: { from: null, to: "2026-11-05T22:59:00.000Z" },
    });
    expect(diff(before, before)).toEqual({});
  });

  it.each([
    ["/admin", "/admin"],
    ["/admin?tab=all&q=kuda&page=2", "/admin?tab=all&q=kuda&page=2"],
    ["/admin/o/abc", "/admin/o/abc"],
    ["/administrator", "/admin"],
    ["https://evil.example/admin", "/admin"],
    ["//evil.example", "/admin"],
    ["/opportunities", "/admin"],
    ["", "/admin"],
  ])("after an action, %s goes back to %s", (value, back) => {
    expect(safeBack(value)).toBe(back);
  });
});

describe("source text marks", () => {
  it("marks dates and place words and keeps every character", () => {
    const text = "Apply by 5 November 2026. The role is hybrid in Lagos; interviews on 2026-11-20.";
    const runs = highlight(text);
    expect(runs.map((r) => r.text).join("")).toBe(text);
    expect(runs.filter((r) => r.mark).map((r) => [r.text, r.mark])).toEqual([
      ["5 November 2026", "date"],
      ["hybrid", "place"],
      ["Lagos", "place"],
      ["2026-11-20", "date"],
    ]);
  });

  it("does not mark inside other words, and leaves plain text alone", () => {
    expect(highlight("A remotely interesting mayor.").filter((r) => r.mark)).toEqual([]);
    expect(highlight("")).toEqual([]);
    expect(
      highlight("Deadline: March 3, 2027 (online)")
        .filter((r) => r.mark)
        .map((r) => r.text),
    ).toEqual(["March 3, 2027", "online"]);
  });
});
