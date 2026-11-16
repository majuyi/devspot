import { describe, expect, it } from "vitest";
import { ago, byReadState, overview, READ_WORD, readState } from "@/ui/status";

const NOW = new Date("2026-11-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const src = (health: Parameters<typeof readState>[0]["health"], h: number | null) => ({
  health,
  lastOkAt: h === null ? null : hoursAgo(h),
});

describe("how a source reads to a reader (docs/01 §3)", () => {
  it.each([
    [src("healthy", 2), "onTime"],
    [src("healthy", 7.9), "onTime"],
    // 8 hours, not the 6 between runs: a run that starts late must not turn every source late.
    [src("healthy", 8.1), "late"],
    [src("healthy", 23.9), "late"],
    [src("healthy", 24.1), "failing"],
    [src("stale", 3), "onTime"],
    // Three failed reads in a row is failing, however recent the last good one.
    [src("erroring", 3), "failing"],
    [src("erroring", null), "failing"],
    [src("new", null), "new"],
    [src("new", 1), "onTime"],
    [src("disabled", 1), "off"],
    // Entered by hand: the engine never reads it, so it is not "new" forever.
    [{ ...src("new", null), kind: "manual" }, "off"],
    [{ ...src("healthy", 2), kind: "feed" }, "onTime"],
  ] as const)("%o is %s", (s, state) => {
    expect(readState(s, NOW)).toBe(state);
  });

  it("orders worst first and words every state", () => {
    expect((["onTime", "off", "late", "new", "failing"] as const).toSorted(byReadState)).toEqual([
      "failing",
      "late",
      "new",
      "onTime",
      "off",
    ]);
    expect(READ_WORD).toMatchObject({ onTime: "On time", late: "Late", failing: "Failing" });
  });
});

describe("the overview", () => {
  it("all on time: normal operations", () => {
    const o = overview([src("healthy", 1), src("healthy", 5), src("stale", 2)], NOW);
    expect(o).toMatchObject({
      onTime: 3,
      late: 0,
      failing: 0,
      attention: false,
      headline: "Normal operations",
      summary: "All 3 sources read in the last 8 hours.",
    });
  });

  it("some behind: says how many, and that their listings may be out of date", () => {
    const o = overview(
      [
        src("healthy", 1),
        src("healthy", 9),
        src("erroring", 2),
        src("new", null),
        src("disabled", 1),
      ],
      NOW,
    );
    expect(o).toMatchObject({
      onTime: 1,
      late: 1,
      failing: 1,
      // New and disabled sources are in none of the three counts.
      tracked: 3,
      attention: true,
      headline: "2 sources need attention",
      summary:
        "1 of 3 sources read in the last 8 hours. Listings from the other 2 may be out of date.",
    });
    expect(overview([src("healthy", 1), src("healthy", 30)], NOW)).toMatchObject({
      headline: "1 source needs attention",
      summary:
        "1 of 2 sources read in the last 8 hours. Listings from the other one may be out of date.",
    });
  });

  it("nothing read yet says so, and is not an alarm", () => {
    expect(overview([src("new", null)], NOW)).toMatchObject({
      tracked: 0,
      attention: false,
      headline: "No source has been read yet",
    });
    expect(overview([], NOW).headline).toBe("No source has been read yet");
  });

  it("says how long ago", () => {
    expect(ago(hoursAgo(0), NOW)).toBe("just now");
    expect(ago(hoursAgo(0.5), NOW)).toBe("30m ago");
    expect(ago(hoursAgo(2.9), NOW)).toBe("2h ago");
    expect(ago(hoursAgo(50), NOW)).toBe("2d ago");
  });
});
