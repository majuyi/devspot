import { decodePreferences, encodePreferences } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import {
  feedHref,
  isEmptyPrefs,
  prefsFromForm,
  prefsFromSearch,
  prefsQuery,
  prefsSummary,
  safeNext,
  tagLabel,
} from "@/ui/prefs";

const search = (q: string) => prefsFromSearch(Object.fromEntries(new URLSearchParams(q)));
const form = (fields: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of fields) f.append(k, v);
  return prefsFromForm(f);
};

describe("preferences in a URL (docs/01 §2)", () => {
  it("reads kinds, city, tags and remote", () => {
    expect(search("kinds=job,internship&city=lagos&tags=ml,women-in-tech&remote=1")).toEqual({
      v: 1,
      kinds: ["job", "internship"],
      city: "lagos",
      tags: ["ml", "women-in-tech"],
      remoteOnly: true,
    });
  });

  it("is null when the URL names no preference, whatever else it carries", () => {
    expect(search("")).toBeNull();
    expect(search("edit=1&cursor=abc")).toBeNull();
  });

  it("drops what it does not understand", () => {
    expect(search("kinds=job,nonsense&city=atlantis&tags=ml,made-up")).toEqual({
      v: 1,
      kinds: ["job"],
      tags: ["ml"],
    });
  });

  it("writes a query that reads back the same", () => {
    for (const q of [
      "kinds=event&city=lagos",
      "kinds=job,internship&tags=ml,women-in-tech&remote=1",
      "city=port-harcourt",
    ]) {
      const p = search(q);
      if (!p) throw new Error(q);
      expect(prefsQuery(p)).toBe(q);
      expect(feedHref(p)).toBe(`/feed?${q}`);
    }
    expect(feedHref()).toBe("/feed");
    expect(feedHref(null, { edit: true })).toBe("/feed?edit=1");
    expect(feedHref(search("city=kano"), { cursor: "a b" })).toBe("/feed?city=kano&cursor=a%20b");
  });
});

describe("preferences from the form", () => {
  it("reads ticked boxes as repeated fields", () => {
    expect(
      form([
        ["kinds", "job"],
        ["kinds", "grant"],
        ["city", "ibadan"],
        ["tags", "ml"],
        ["remote", "1"],
        ["next", "/feed"],
      ]),
    ).toEqual({ v: 1, kinds: ["job", "grant"], city: "ibadan", tags: ["ml"], remoteOnly: true });
  });

  it("reads browse's comma lists, and nothing ticked as a feed of everything", () => {
    expect(
      form([
        ["kinds", "hackathon,competition"],
        ["city", ""],
        ["tags", ""],
      ]),
    ).toEqual({
      v: 1,
      kinds: ["hackathon", "competition"],
      tags: [],
    });
    const empty = form([["city", ""]]);
    expect(empty).toEqual({ v: 1, kinds: [], tags: [] });
    expect(isEmptyPrefs(empty)).toBe(true);
  });

  it("survives the cookie round trip", () => {
    const p = form([
      ["kinds", "event"],
      ["city", "lagos"],
    ]);
    expect(decodePreferences(encodePreferences(p))).toEqual(p);
    expect(decodePreferences("v1.not-base64-json")).toBeUndefined();
    expect(decodePreferences(undefined)).toBeUndefined();
  });
});

describe("summary", () => {
  it.each([
    [
      "kinds=job,internship,hackathon&city=lagos",
      "Work, Hackathons · Lagos, nationwide and remote",
    ],
    ["kinds=event", "Events · All of Nigeria and remote"],
    ["remote=1&tags=women-in-tech,ml", "Every kind · Remote only · Tagged women in tech, ML"],
    ["city=kano&remote=1", "Every kind · Remote only"],
  ])("%s reads %s", (q, line) => {
    const p = search(q);
    if (!p) throw new Error(q);
    expect(prefsSummary(p)).toBe(line);
  });
});

describe("tag labels", () => {
  it("reads as words, with the two that are not plain words spelt right", () => {
    expect(["women-in-tech", "fully-funded", "ml", "devops", "web3"].map(tagLabel)).toEqual([
      "Women in tech",
      "Fully funded",
      "ML",
      "DevOps",
      "Web3",
    ]);
  });
});

describe("where a form may send the reader", () => {
  it.each([
    ["/feed", "/feed"],
    [
      "/opportunities?kinds=job,internship&city=lagos",
      "/opportunities?kinds=job,internship&city=lagos",
    ],
    ["https://evil.example/", "/feed"],
    ["//evil.example/", "/feed"],
    ["/\\evil.example", "/feed"],
    ["javascript:alert(1)", "/feed"],
    ["feed", "/feed"],
    ["", "/feed"],
  ])("%s goes to %s", (value, next) => {
    expect(safeNext(value)).toBe(next);
  });
  it("ignores a missing or non-text value", () => {
    expect(safeNext(null)).toBe("/feed");
  });
});
