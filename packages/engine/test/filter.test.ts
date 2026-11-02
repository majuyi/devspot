import type { RawItemInput } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import { applyItemFilter, InvalidItemFilter, itemMatcher, parseItemFilter } from "../src/filter.js";

const job = (title: string, department?: string): RawItemInput => ({
  url: `https://jobs.example/${encodeURIComponent(title)}`,
  title,
  text: title,
  ...(department === undefined ? {} : { meta: { department } }),
});
const titles = (items: RawItemInput[]) => items.map((i) => i.title);

describe("applyItemFilter", () => {
  it("keeps everything without a filter", () => {
    const items = [job("Senior Engineer"), job("Collections Specialist")];
    expect(applyItemFilter(items, undefined)).toEqual({ kept: items, dropped: 0 });
  });

  it("drops senior titles and keeps entry-level ones that also look senior", () => {
    const items = [
      "Backend Engineer",
      "Senior Backend Engineer",
      "Sr. Data Analyst",
      "Engineering Manager",
      "Head of Design",
      "Tech Lead",
      "Principal Engineer",
      "Staff Engineer",
      "Software Architect",
      "VP, Product",
      "Associate Product Manager",
      "Product Design Intern",
      "Graduate Trainee, Software",
      "Junior Data Analyst",
    ].map((t) => job(t));
    const { kept, dropped } = applyItemFilter(items, { seniority: "early" });
    expect(titles(kept)).toEqual([
      "Backend Engineer",
      "Associate Product Manager",
      "Product Design Intern",
      "Graduate Trainee, Software",
      "Junior Data Analyst",
    ]);
    expect(dropped).toBe(9);
  });

  it("matches whole words only", () => {
    const items = [job("Leadership Programme Fellow"), job("Headless CMS Developer")];
    expect(titles(applyItemFilter(items, { seniority: "early" }).kept)).toEqual([
      "Leadership Programme Fellow",
      "Headless CMS Developer",
    ]);
  });

  it("keeps listed departments, case-insensitively, and drops items with none", () => {
    const items = [
      job("Android Engineer", "Engineering"),
      job("Data Scientist", " data science "),
      job("Collections Specialist", "Operations"),
      job("Mystery Role"),
    ];
    const filter = { departments: ["Engineering", "Data Science"], seniority: "any" as const };
    expect(titles(applyItemFilter(items, filter).kept)).toEqual([
      "Android Engineer",
      "Data Scientist",
    ]);
  });

  it("keeps titles containing a keyword as whole words, case-insensitively", () => {
    const items = [
      job("Enterprise Integration Engineer"),
      job("Data Scientist, Risk"),
      job("Machine  Learning Engineer"),
      job("Settlement Analyst"),
      job("Engineering Relations Partner"),
      job("Telesales Agent"),
    ];
    const filter = {
      titles: ["engineer", "Data Scientist", "machine learning"],
      seniority: "any" as const,
    };
    expect(titles(applyItemFilter(items, filter).kept)).toEqual([
      "Enterprise Integration Engineer",
      "Data Scientist, Risk",
      "Machine  Learning Engineer",
    ]);
  });

  it("keeps an item when its department or its title matches", () => {
    const items = [
      job("Database Administrator", "Engineering"),
      job("Data Scientist, Risk", "Risk"),
      job("Data Scientist (no department)"),
      job("Collections Specialist", "Risk"),
    ];
    const filter = {
      departments: ["Engineering"],
      titles: ["data scientist"],
      seniority: "any" as const,
    };
    expect(titles(applyItemFilter(items, filter).kept)).toEqual([
      "Database Administrator",
      "Data Scientist, Risk",
      "Data Scientist (no department)",
    ]);
  });

  it("treats keywords as text, not patterns", () => {
    const items = [job("C++ Developer"), job("C Developer"), job("Cx Developer")];
    const filter = { titles: ["c++"], seniority: "any" as const };
    expect(titles(applyItemFilter(items, filter).kept)).toEqual(["C++ Developer"]);
  });

  it("drops items stated to be in another country and keeps those that state none", () => {
    const at = (title: string, country?: string): RawItemInput => ({
      ...job(title),
      ...(country ? { meta: { country } } : {}),
    });
    const items = [at("Java Developer", "NG"), at("Java Developer", "RU"), at("Java Developer")];
    const { kept, dropped } = applyItemFilter(items, { countries: ["NG"], seniority: "any" });
    expect(kept.map((i) => i.meta?.country)).toEqual(["NG", undefined]);
    expect(dropped).toBe(1);
    expect(itemMatcher({ countries: ["NG"], seniority: "any" })({ country: "ng" })).toBe(true);
  });

  it("answers for listing data alone, so an adapter can ask before fetching detail", () => {
    const keep = itemMatcher({ departments: ["Engineering"], seniority: "early" });
    expect(keep({ title: "Backend Engineer", department: "engineering" })).toBe(true);
    expect(keep({ title: "Senior Backend Engineer", department: "Engineering" })).toBe(false);
    expect(keep({ title: "Backend Engineer" })).toBe(false);
    expect(itemMatcher(undefined)({})).toBe(true);
  });

  it("applies both rules together", () => {
    const items = [
      job("Senior Android Engineer", "Engineering"),
      job("Android Engineer", "Engineering"),
      job("Sales Intern", "Sales"),
    ];
    const { kept, dropped } = applyItemFilter(items, {
      departments: ["Engineering"],
      seniority: "early",
    });
    expect(titles(kept)).toEqual(["Android Engineer"]);
    expect(dropped).toBe(2);
  });
});

describe("parseItemFilter", () => {
  it("reads the stored JSON and fills the default", () => {
    expect(parseItemFilter(null)).toBeUndefined();
    expect(parseItemFilter({ departments: ["Engineering"] })).toEqual({
      departments: ["Engineering"],
      seniority: "early",
    });
  });
  it("fails loudly rather than running unfiltered", () => {
    expect(() => parseItemFilter({ departments: [] })).toThrow(InvalidItemFilter);
    expect(() => parseItemFilter({ roles: ["x"] })).toThrow(InvalidItemFilter);
  });
});
