// @vitest-environment jsdom
import axe from "axe-core";
import type { ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, text } from "../components/render";
import { hasDb, NOW, seedHome } from "../seed";

type HomeModule = typeof import("../../src/components/home");
type BrowseModule = typeof import("../../src/app/opportunities/page");

async function violations(el: HTMLElement, title: string): Promise<string[]> {
  document.documentElement.lang = "en-GB";
  document.title = title;
  document.body.replaceChildren(el);
  const result = await axe.run(document, {
    // jsdom does no layout or CSS; contrast is covered by the token test and Lighthouse.
    rules: { "color-contrast": { enabled: false } },
  });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

const section = (el: HTMLElement, id: string) => {
  const s = el.querySelector(`section[aria-labelledby="${id}"]`);
  if (!s) throw new Error(`no section ${id}`);
  return s;
};
const rowSlugs = (el: Element) =>
  [...el.querySelectorAll('a[href^="/o/"]')]
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => !h.endsWith(".ics"))
    .map((h) => h.slice(3));
const bands = (el: Element) => [...el.querySelectorAll("[data-band]")].map(text);
const link = (el: Element, label: string) =>
  [...el.querySelectorAll("a")].find((a) => text(a).startsWith(label))?.getAttribute("href");

describe.skipIf(!hasDb)("pages, as a reader without JavaScript receives them", () => {
  let Home: HomeModule["Home"];
  let Browse: BrowseModule["default"];
  const browse = async (query = "") =>
    render(
      (await Browse({
        searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(query))),
      })) as ReactElement,
    );

  beforeAll(async () => {
    const { db } = await import("@devspot/db");
    await seedHome(db);
    ({ Home } = await import("../../src/components/home"));
    Browse = (await import("../../src/app/opportunities/page")).default;
    // The pages read the clock themselves; only Date is faked so the database still answers.
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  describe("home", () => {
    it("closing soon: every band, five later items, then the rest on browse", async () => {
      const el = render(await Home({}));
      const closing = section(el, "closing-soon");
      expect(bands(closing)).toEqual([
        "TodayWed 4 Nov 2026",
        "TomorrowThu 5 Nov 2026",
        "This weekto Wed 11 Nov",
        "Laterfrom Thu 12 Nov",
      ]);
      expect(rowSlugs(closing)).toEqual([
        "today",
        "tomorrow",
        "lagos-hybrid",
        "edge-week",
        "later-1",
        "later-2",
        "later-3",
        "later-4",
        "later-5",
      ]);
      expect(text(closing)).toContain("All 37 open");
      expect(text(closing)).toContain("All 3 sources read in the last 6 hours. Status");
      expect(link(closing, "28 more open")).toBe("/opportunities");
    });

    it("starting soon: events banded This week and Later, counting days only", async () => {
      const starting = section(render(await Home({})), "starting-soon");
      expect(bands(starting)).toEqual(["This weekto Wed 11 Nov", "Laterfrom Thu 12 Nov"]);
      expect(rowSlugs(starting)).toEqual(["ev-today", "ev-deadline", "ev-a", "ev-b"]);
      expect(link(starting, "All 7 events")).toBe("/events");
      expect(text(starting)).toContain("Starts today");
      expect(text(starting)).toContain("Scheduled");
      // 8 days, never "8d 8h".
      expect(text(starting)).toMatch(/8dEvent/);
    });

    it("new this week and the kind chips link to browse", async () => {
      const el = render(await Home({}));
      expect(rowSlugs(section(el, "new-this-week"))).toEqual(["rolling", "today", "tomorrow"]);
      expect(link(section(el, "new-this-week"), "See all")).toBe("/opportunities?sort=new");
      const kinds = el.querySelector('nav[aria-label="Kinds"]');
      expect([...(kinds?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href"))).toEqual([
        "/opportunities",
        "/opportunities?kinds=job,internship",
        "/opportunities?kinds=hackathon,competition",
        "/opportunities?kinds=event",
        "/opportunities?kinds=scholarship,grant,fellowship",
        "/opportunities?kinds=bootcamp,ossProgram,accelerator",
      ]);
    });

    it("near you: a prompt with no city; with one, three items and the rest on browse", async () => {
      const plain = section(render(await Home({})), "near-you");
      expect(rowSlugs(plain)).toEqual([]);
      expect(text(plain)).toContain("Remote items are listed for everyone.");

      const el = render(await Home({ city: "lagos" }));
      const near = section(el, "near-you");
      expect(text(near)).toContain("Near you · Lagos");
      expect(rowSlugs(near)).toEqual(["ev-deadline", "lagos-hybrid", "ev-ongoing"]);
      expect(link(near, "3 more in Lagos")).toBe("/opportunities?city=lagos");
      expect(link(near, "Change city")).toBe("/");
      // The city chooses this section only.
      expect(rowSlugs(section(el, "closing-soon"))).toEqual(
        rowSlugs(section(render(await Home({})), "closing-soon")),
      );
    });

    it("has one h1, never says who can apply, and has no axe violations", async () => {
      for (const city of [undefined, "lagos"] as const) {
        const el = render(await Home({ city }));
        expect(el.querySelectorAll("h1")).toHaveLength(1);
        expect(text(el)).not.toMatch(/eligib|qualif/i);
        expect(await violations(el, "devspot")).toEqual([]);
      }
    });
  });

  describe("browse", () => {
    it("lists everything open by deadline, in bands, 30 to a page", async () => {
      const el = await browse();
      expect(text(el.querySelector("h1") as Element)).toBe("Opportunities");
      expect(text(el)).toContain("37 open");
      expect(bands(el)).toEqual([
        "Deadline passed",
        "TodayWed 4 Nov 2026",
        "TomorrowThu 5 Nov 2026",
        "This weekto Wed 11 Nov",
        "Laterfrom Thu 12 Nov",
        "No closing date",
      ]);
      expect(rowSlugs(el)).toHaveLength(30);
      expect(rowSlugs(el).slice(0, 4)).toEqual(["passed", "today", "ev-deadline", "tomorrow"]);
      // An event under way is open: its row never says "Closed".
      const ongoing = el.querySelector('a[href="/o/ev-ongoing"]') as Element;
      expect(text(ongoing)).toMatch(/^StartedEvent/);
      expect(text(el)).toContain("Showing 30 of 37. Closed items are hidden. Show closed");
    });

    it("the next page is a link, and the two pages share no row", async () => {
      const first = await browse();
      const next = link(first, "Next page");
      expect(next).toMatch(/^\/opportunities\?cursor=/);
      const second = await browse((next ?? "").split("?")[1]);
      expect(rowSlugs(second)).toHaveLength(7);
      expect(rowSlugs(second).filter((s) => rowSlugs(first).includes(s))).toEqual([]);
      expect(text(second)).toContain("Showing the next 7 of 37.");
      expect(link(second, "Back to the first page")).toBe("/opportunities");
      expect(link(second, "Next page")).toBeUndefined();
    });

    it("a family: its title, what it holds, its chip selected with a link that clears it", async () => {
      const el = await browse("kinds=job,internship");
      expect(text(el.querySelector("h1") as Element)).toBe("Work");
      expect(text(el)).toContain("Jobs and internships · 4 open");
      const chip = el.querySelector('nav[aria-label="Kinds"] a[aria-current="true"]');
      expect(text(chip as Element)).toBe("Work, clear");
      expect(chip?.getAttribute("href")).toBe("/opportunities");
      expect(new Set(rowSlugs(el))).toEqual(
        new Set(["lagos-hybrid", "lagos-job", "ibadan-job", "remote-ng"]),
      );
    });

    it("a place keeps the other filters; a city lists nationwide and remote too", async () => {
      const el = await browse("kinds=job,internship&city=lagos");
      expect(text(el.querySelector("h1") as Element)).toBe("Work in Lagos");
      expect(new Set(rowSlugs(el))).toEqual(new Set(["lagos-hybrid", "lagos-job", "remote-ng"]));
      const places = el.querySelector('nav[aria-label="Places"]') as Element;
      expect(text(places.querySelector('[aria-current="true"]') as Element)).toBe("Lagos, 5 open");
      expect(link(places, "All places")).toBe("/opportunities?kinds=job,internship");
      expect(link(places, "Remote")).toBe("/opportunities?kinds=job,internship&remote=1");
      expect(link(places, "Ibadan")).toBe("/opportunities?kinds=job,internship&city=ibadan");
    });

    it("only events: ordered and banded by start", async () => {
      const el = await browse("kinds=event");
      expect(text(el)).toContain("Sorted by starting soonest");
      expect(rowSlugs(el)).toEqual([
        "ev-ongoing",
        "ev-today",
        "ev-deadline",
        "ev-a",
        "ev-b",
        "ev-c",
        "ev-d",
      ]);
      expect(bands(el)).toEqual(["This weekto Wed 11 Nov", "Laterfrom Thu 12 Nov"]);
    });

    it("search narrows the current view and keeps its filters in the form", async () => {
      const el = await browse("kinds=hackathon,competition&q=later-3");
      expect(rowSlugs(el)).toEqual(["later-3"]);
      expect(text(el)).toContain("Matching “later-3” · 1 open · Clear all");
      const form = el.querySelector('form[role="search"]') as HTMLFormElement;
      expect(form.getAttribute("action")).toBe("/opportunities");
      expect((form.querySelector("#q") as HTMLInputElement).value).toBe("later-3");
      expect((form.querySelector('[name="kinds"]') as HTMLInputElement).value).toBe(
        "hackathon,competition",
      );
    });

    it("newest first has no bands; closed items show only when asked", async () => {
      const newest = await browse("sort=new");
      expect(bands(newest)).toEqual([]);
      expect(rowSlugs(newest).slice(0, 3)).toEqual(["rolling", "today", "tomorrow"]);
      expect(rowSlugs(await browse("q=closed"))).toEqual([]);
      const withClosed = await browse("q=closed&status=all");
      expect(rowSlugs(withClosed)).toEqual(["closed"]);
      expect(bands(withClosed)).toEqual(["Deadline passed"]);
      expect(link(withClosed, "Hide closed")).toBe("/opportunities?q=closed");
    });

    it("an empty result explains itself and offers ways out", async () => {
      const el = await browse("kinds=scholarship,grant,fellowship&remote=1");
      expect(text(el.querySelector("h2") as Element)).toBe(
        "Nothing open for Funding that is remote right now",
      );
      expect(link(el, "Funding in every place")).toBe(
        "/opportunities?kinds=scholarship,grant,fellowship",
      );
      expect(link(el, "Everything open")).toBe("/opportunities");
      expect(text(el)).toContain("0 open");
    });

    it("the same URL gives the same view, and a review item never shows", async () => {
      const query = "kinds=hackathon,competition&closing=7&sort=new";
      expect((await browse(query)).innerHTML).toBe((await browse(query)).innerHTML);
      expect(rowSlugs(await browse("q=in-review&status=all"))).toEqual([]);
    });

    it("has no axe violations, with results and without", async () => {
      expect(await violations(await browse("kinds=job,internship&city=lagos"), "Work")).toEqual([]);
      expect(await violations(await browse("q=zzzz"), "Opportunities")).toEqual([]);
      expect(text(await browse())).not.toMatch(/eligib|qualif/i);
    });
  });
});
