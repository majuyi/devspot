import { describe, expect, it } from "vitest";
import {
  browseHref,
  browseNotes,
  browseTitle,
  countLabel,
  emptyActions,
  emptyHeading,
  hasFilters,
  parseBrowseParams,
  toFilters,
} from "@/ui/browse";
import { freshnessLine } from "@/ui/freshness";
import { familyOf, kindList } from "@/ui/kind";

const parse = (query: string) =>
  parseBrowseParams(Object.fromEntries(new URLSearchParams(query).entries()));

describe("browse URL (docs/01 §3)", () => {
  it("reads every filter", () => {
    expect(
      parse(
        "q=ai&kinds=job,internship&city=lagos&tags=ml,web&org=kuda&closing=7&sort=new&status=all&cursor=abc",
      ),
    ).toEqual({
      q: "ai",
      kinds: ["job", "internship"],
      city: "lagos",
      remote: false,
      tags: ["ml", "web"],
      org: "kuda",
      closing: 7,
      sort: "new",
      closed: true,
      cursor: "abc",
    });
  });

  it("drops what it does not understand instead of failing", () => {
    expect(parse("kinds=job,nonsense&city=atlantis&closing=9&sort=sideways&remote=yes")).toEqual({
      q: undefined,
      kinds: ["job"],
      city: undefined,
      remote: false,
      tags: [],
      org: undefined,
      closing: undefined,
      sort: "deadline",
      closed: false,
      cursor: undefined,
    });
    expect(parseBrowseParams({ kinds: ["grant", "job"], q: ["  two words  "] })).toMatchObject({
      kinds: ["grant"],
      q: "two words",
    });
  });

  it("one place at a time: a city wins over remote", () => {
    expect(parse("city=lagos&remote=1")).toMatchObject({ city: "lagos", remote: false });
    expect(parse("remote=1")).toMatchObject({ remote: true });
  });

  it("writes a URL that reads back to the same filters", () => {
    for (const query of [
      "",
      "kinds=hackathon,competition",
      "q=data%20science&kinds=grant&city=port-harcourt&status=all",
      "remote=1&tags=ml&closing=30&sort=new",
      "org=kuda&cursor=eyJrIjpudWxsfQ",
    ]) {
      const p = parse(query);
      const href = browseHref(p);
      expect(href).toBe(query ? `/opportunities?${query}` : "/opportunities");
      expect(parse(href.split("?")[1] ?? "")).toEqual(p);
    }
  });

  it("escapes what a reader typed", () => {
    expect(browseHref({ q: "c++ & more" })).toBe("/opportunities?q=c%2B%2B%20%26%20more");
    expect(parse("q=c%2B%2B%20%26%20more").q).toBe("c++ & more");
  });

  it("turns the page's filters into the data layer's", () => {
    expect(toFilters(parse("kinds=event&city=kano&closing=2&status=all"))).toEqual({
      q: undefined,
      kinds: ["event"],
      city: "kano",
      remote: undefined,
      tags: undefined,
      org: undefined,
      closingWithin: 2,
      sort: "deadline",
      status: "all",
      cursor: undefined,
    });
    expect(toFilters(parse("")).status).toBe("published");
  });
});

describe("browse wording", () => {
  it.each([
    ["", "Opportunities"],
    ["kinds=hackathon,competition", "Build"],
    ["kinds=competition,hackathon", "Build"],
    ["kinds=scholarship,grant,fellowship&city=kano", "Funding in Kano"],
    ["kinds=grant", "Grants"],
    ["kinds=job,grant", "Jobs and grants"],
    ["city=port-harcourt", "Opportunities in Port Harcourt"],
    ["remote=1", "Remote opportunities"],
    ["kinds=job,internship&remote=1", "Work, remote"],
  ])("%s is titled %s", (query, title) => {
    expect(browseTitle(parse(query))).toBe(title);
  });

  it("the notes say what the title leaves out", () => {
    expect(browseNotes(parse("kinds=hackathon,competition"))).toEqual([
      "Hackathons and competitions",
    ]);
    expect(browseNotes(parse("kinds=event"))).toEqual([]);
    expect(browseNotes(parse("city=kano&q=ai&closing=2&tags=ml"))).toEqual([
      "With nationwide and remote",
      "Matching “ai”",
      "Tagged ml",
      "Closing in 48 hours",
    ]);
    expect(countLabel(1240, false)).toBe("1,240 open");
    expect(countLabel(3, true)).toBe("3 open or closed");
  });

  it("an empty result says what was asked for and offers ways out", () => {
    const p = parse("kinds=scholarship,grant,fellowship&city=kano");
    expect(emptyHeading(p)).toBe("Nothing open for Funding in Kano right now");
    expect(emptyActions(p)).toEqual([
      {
        href: "/opportunities?kinds=scholarship,grant,fellowship",
        label: "Funding in every place",
      },
      { href: "/opportunities?city=kano", label: "Everything in Kano" },
      { href: "/opportunities", label: "Everything open" },
    ]);
    expect(emptyHeading(parse("q=zzz"))).toBe("Nothing open matches “zzz”");
    expect(emptyHeading(parse("remote=1&status=all"))).toBe("Nothing that is remote right now");
    expect(emptyHeading(parse("kinds=job,internship&remote=1"))).toBe(
      "Nothing open for Work that is remote right now",
    );
    expect(emptyActions(parse(""))).toEqual([{ href: "/", label: "Back to home" }]);
    expect(hasFilters(parse("sort=new&status=all"))).toBe(false);
  });

  it("names a family only for exactly its kinds", () => {
    expect(familyOf(["grant", "scholarship", "fellowship"])).toBe("funding");
    expect(familyOf(["grant"])).toBeUndefined();
    expect(familyOf([])).toBeUndefined();
    expect(kindList(["bootcamp", "ossProgram", "accelerator"])).toBe(
      "Bootcamps, open-source programmes and accelerators",
    );
  });
});

describe("freshness line", () => {
  it.each([
    [{ total: 23, read: 23, withinHours: 6 }, "All 23 sources read in the last 6 hours."],
    [{ total: 23, read: 23, withinHours: 1 }, "All 23 sources read in the last hour."],
    [{ total: 23, read: 21, withinHours: 24 }, "21 of 23 sources read in the last 24 hours."],
    [{ total: 1, read: 1, withinHours: 2 }, "The one source was read in the last 2 hours."],
    [{ total: 0, read: 0, withinHours: 24 }, null],
  ])("%o reads %s", (f, line) => {
    expect(freshnessLine(f)).toBe(line);
  });
});
