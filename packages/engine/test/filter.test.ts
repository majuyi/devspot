import type { RawItemInput } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import { applyItemFilter, InvalidItemFilter, parseItemFilter } from "../src/filter.js";

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
    expect(dropped).toBe(8);
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
    expect(() => parseItemFilter({ titles: ["x"] })).toThrow(InvalidItemFilter);
  });
});
