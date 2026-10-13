import { describe, expect, it } from "vitest";
import { canonicalizeUrl, contentHash, normalizeText } from "../src/dedupe.js";

describe("canonicalizeUrl", () => {
  it.each([
    ["https://Example.ORG/Jobs/", "https://example.org/Jobs"],
    ["https://example.org/a/b///", "https://example.org/a/b"],
    ["https://example.org/", "https://example.org/"],
    ["https://example.org", "https://example.org/"],
    ["https://example.org/a#apply", "https://example.org/a"],
    ["https://example.org/a?utm_source=x&utm_medium=y", "https://example.org/a"],
    ["https://example.org/a?UTM_Campaign=z&id=4", "https://example.org/a?id=4"],
    ["https://example.org/a?fbclid=abc", "https://example.org/a"],
    ["https://example.org/a?ref=twitter&page=2", "https://example.org/a?page=2"],
    ["https://example.org/a?referrer=x", "https://example.org/a?referrer=x"],
    ["https://example.org/a?b=2&a=1", "https://example.org/a?b=2&a=1"],
    ["https://example.org/a?q=hello%20world&utm_x=1", "https://example.org/a?q=hello%20world"],
    ["https://example.org/a?flag", "https://example.org/a?flag"],
    ["https://example.org:443/a", "https://example.org/a"],
    ["http://example.org/a", "http://example.org/a"],
    ["https://example.org/a/?id=1#x", "https://example.org/a?id=1"],
  ])("%s → %s", (input, expected) => {
    expect(canonicalizeUrl(input)).toBe(expected);
  });
});

describe("normalizeText", () => {
  it.each([
    ["Last updated: 12 October 2026", "Last updated"],
    ["Last updated on 12 October 2026. Apply by 1 Nov.", "Last updated. Apply by 1 Nov."],
    ["Updated on Oct 12, 2026 at 9:00 am\nDeadline: 1 Nov", "Updated on Deadline: 1 Nov"],
    ["Last modified 2026-10-12T09:00:00Z", "Last modified"],
    ["Page updated 12/10/2026", "Page updated"],
    ["last-reviewed: 3 March 2025", "last-reviewed"],
    ["  Apply\n\n  by   1 Nov  ", "Apply by 1 Nov"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it("leaves other dates alone, deadlines above all", () => {
    for (const text of [
      "Applications close 31 October 2026.",
      "Deadline updated: now 15 November 2026",
      "We updated the programme in 2026.",
    ])
      expect(normalizeText(text)).toBe(text);
  });
});

describe("contentHash", () => {
  it("ignores whitespace and last-updated dates, not content", () => {
    const base = contentHash("Apply by 1 Nov.\n\nLast updated: 1 October 2026");
    expect(contentHash("Apply  by 1 Nov. Last updated: 9 October 2026")).toBe(base);
    expect(contentHash("Apply by 2 Nov.\n\nLast updated: 1 October 2026")).not.toBe(base);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
  });
});
