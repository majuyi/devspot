import { describe, expect, it } from "vitest";
import {
  CITIES,
  decodePreferences,
  encodePreferences,
  normalizeTags,
  OpportunityDraft,
  OrganizationYaml,
  Preferences,
} from "../src/index.js";

describe("OrganizationYaml", () => {
  const valid = {
    slug: "hng",
    name: "HNG Tech",
    category: "trainingProvider",
    homepageUrl: "https://hng.tech",
    country: "NG",
    sources: [{ name: "site", kind: "html", url: "https://hng.tech/internship", adapter: "hng" }],
  };
  it("accepts a valid organization", () => {
    expect(OrganizationYaml.safeParse(valid).success).toBe(true);
  });
  it("rejects an html source without an adapter", () => {
    const r = OrganizationYaml.safeParse({
      ...valid,
      sources: [{ name: "site", kind: "html", url: "https://hng.tech" }],
    });
    expect(r.success).toBe(false);
  });
  it("rejects an unknown city", () => {
    expect(OrganizationYaml.safeParse({ ...valid, city: "atlantis" }).success).toBe(false);
  });
});

describe("OpportunityDraft", () => {
  it("defaults deadlineKind to unknown and never requires a date", () => {
    const r = OpportunityDraft.parse({ title: "Backend Intern", canonicalUrl: "https://x.org/a" });
    expect(r.deadlineKind).toBe("unknown");
    expect(r.deadlineAt).toBeUndefined();
  });
});

describe("Preferences", () => {
  it("round-trips through the cookie encoding", () => {
    const p = Preferences.parse({ v: 1, kinds: ["event"], city: "lagos", tags: [] });
    expect(decodePreferences(encodePreferences(p))).toEqual(p);
  });
  it("ignores garbage", () => {
    expect(decodePreferences("v1.not-base64-json")).toBeUndefined();
  });
});

describe("cities and tags", () => {
  it("has unique slugs", () => {
    expect(new Set(CITIES.map((c) => c.slug)).size).toBe(CITIES.length);
  });
  it("normalizes tags against the allowlist", () => {
    expect(normalizeTags(["Backend", " ML ", "nonsense"])).toEqual(["backend", "ml"]);
  });
});
