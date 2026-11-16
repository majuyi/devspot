import { CITIES } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import { dotRadius, MAP_HEIGHT, MAP_WIDTH, placeTone, project } from "@/ui/map";

const NOW = new Date("2026-11-04T12:00:00Z");
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

describe("map projection", () => {
  it("puts the board's cities where the board drew them", () => {
    const at = (slug: string) => {
      const c = CITIES.find((x) => x.slug === slug);
      if (!c) throw new Error(slug);
      return project(c.lat, c.lng);
    };
    // Board D's dots: Lagos (23.3, 200.5), Ilorin (53.7, 149), Kano (156.9, 58).
    for (const [slug, x, y] of [
      ["lagos", 23.3, 200.5],
      ["ilorin", 53.7, 149],
      ["kano", 156.9, 58],
    ] as const) {
      expect(Math.abs(at(slug).x - x)).toBeLessThan(2.5);
      expect(Math.abs(at(slug).y - y)).toBeLessThan(2.5);
    }
  });

  it("keeps every city in the list inside the picture, north above south", () => {
    for (const c of CITIES) {
      const p = project(c.lat, c.lng);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(MAP_WIDTH);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(MAP_HEIGHT);
    }
    expect(project(12, 8.5).y).toBeLessThan(project(6.5, 3.4).y);
    expect(project(9, 7.5).x).toBeGreaterThan(project(6.5, 3.4).x);
  });
});

describe("dot radius", () => {
  it.each([
    [1, 9],
    [5, 15.2],
    [10, 19.8],
    [11, 20],
    [500, 20],
  ])("%i open is radius %f", (count, r) => {
    expect(dotRadius(count)).toBe(r);
  });
});

describe("place colour: the most urgent item there (docs/07 §3)", () => {
  const place = (deadline: number | null, start: number | null) => ({
    nextDeadlineAt: deadline === null ? null : inHours(deadline),
    nextStartsAt: start === null ? null : inHours(start),
  });
  it.each([
    ["a deadline in 47 hours", place(47, null), "red"],
    ["a deadline in 49 hours", place(49, null), "amber"],
    ["a deadline in 6 days", place(6 * 24, null), "amber"],
    ["a deadline in 8 days", place(8 * 24, null), "none"],
    ["an event in 3 days", place(null, 72), "amber"],
    ["an event in 9 days", place(null, 9 * 24), "none"],
    ["a far deadline and an event this week", place(30 * 24, 48), "amber"],
    ["a deadline tomorrow and an event this week", place(20, 48), "red"],
    ["nothing dated", place(null, null), "none"],
  ] as const)("%s is %s", (_, p, tone) => {
    expect(placeTone(p, NOW)).toBe(tone);
  });
});
