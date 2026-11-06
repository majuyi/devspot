import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, InvalidCursor, KeyCursor } from "../../src/data/cursor";
import { startOfDayWat } from "../../src/data/time";

describe("cursor", () => {
  it("round-trips and rejects anything else", () => {
    const c = { k: "2026-11-04T12:00:00.000Z", id: "abc" };
    expect(decodeCursor(encodeCursor(c), KeyCursor)).toEqual(c);
    expect(decodeCursor(undefined, KeyCursor)).toBeUndefined();
    expect(() => decodeCursor(encodeCursor({ id: 1 }), KeyCursor)).toThrow(InvalidCursor);
    expect(() => decodeCursor("%%%", KeyCursor)).toThrow(InvalidCursor);
  });
});

describe("startOfDayWat", () => {
  it("is 23:00 UTC the evening before, including just after midnight in Lagos", () => {
    expect(startOfDayWat(new Date("2026-11-04T12:00:00Z")).toISOString()).toBe(
      "2026-11-03T23:00:00.000Z",
    );
    expect(startOfDayWat(new Date("2026-11-04T23:30:00Z")).toISOString()).toBe(
      "2026-11-04T23:00:00.000Z",
    );
    expect(startOfDayWat(new Date("2026-11-04T22:59:00Z")).toISOString()).toBe(
      "2026-11-03T23:00:00.000Z",
    );
  });
});
