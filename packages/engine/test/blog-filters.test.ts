import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RawItemInput } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import { applyItemFilter } from "../src/filter.js";
import { FIXTURES_DIR } from "../src/fixtures/fixture.js";
import { loadRegistrySources } from "../src/registry.js";

/**
 * The blog filters in the registry, run over each blog's recorded feed: the calls to apply
 * stay and the news goes. Every call these feeds carried is listed, closed ones included.
 */
const KEPT: Record<string, string[]> = {
  "gsoc/blog": [
    "Open Source, Open Doors, Apply Now for Google Summer of Code!",
    "Mentor Org Applications for Google Summer of Code 2026 open through Feb 3",
    "Google Summer of Code 2025 Contributor Applications Now Open!",
    "Google Summer of Code 2025 is here!",
    "Google Summer of Code 2024 contributor applications are open!",
    "Google Summer of Code 2024 Mentor Organization Applications Now Open",
    "Google Summer of Code 2023 contributor applications open!",
    "Mentor organization applications are open for Google Summer of Code 2023!",
  ],
  "afrilabs/blog": [
    "NASENI Launches InnovateNaija ₦250 Million Challenge, Nigeria’s Biggest Innovation Challenge to Empower Youth Innovation in Nigeria, Backed by Presidential Support, NASENI Innovation Hub and AfriLabs.",
  ],
  "cchub/blog": [
    "Call for Expressions of Interest: Short-Term Data Analysis & Data Systems Consultant, GATEWAY Program",
    "Turn your creative talent into a paying business",
  ],
};

describe("blog item filters against their recorded feeds", () => {
  const sources = loadRegistrySources();
  it.each(Object.entries(KEPT))("%s keeps its calls to apply and drops the news", (key, kept) => {
    const source = sources.find((s) => s.key === key);
    if (!source) throw new Error(`${key} is not in the registry`);
    const dir = resolve(FIXTURES_DIR, key.replace("/", "__"));
    const { items } = JSON.parse(readFileSync(resolve(dir, "expected.json"), "utf8")) as {
      items: RawItemInput[];
    };
    const result = applyItemFilter(items, source.filter);
    expect(result.kept.map((i) => i.title)).toEqual(kept);
    expect(result.dropped).toBeGreaterThan(0);
  });
});
