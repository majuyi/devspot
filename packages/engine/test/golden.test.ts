import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchSource } from "../src/fetch.js";
import { FIXTURES_DIR } from "../src/fixtures/fixture.js";
import { replaySource } from "../src/fixtures/replay.js";
import { loadRegistrySources } from "../src/registry.js";

const recorded = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name.replace("__", "/"));

describe("golden output", () => {
  const sources = loadRegistrySources();

  it("every fixture belongs to a source in the registry", () => {
    const keys = new Set(sources.map((s) => s.key));
    expect(recorded.filter((k) => !keys.has(k))).toEqual([]);
  });

  it("every fetchable source has a fixture", () => {
    // html and api sources join this list as their adapters land in M1.5.
    const fetchable = sources.filter((s) => s.kind === "feed").map((s) => s.key);
    expect(fetchable.filter((k) => !recorded.includes(k))).toEqual([]);
  });

  it.each(recorded)("%s replays to expected.json", async (key) => {
    const source = sources.find((s) => s.key === key);
    if (!source) throw new Error(`${key} is not in the registry`);
    const result = await replaySource({ source, fetch: fetchSource });
    expect(result.equal, result.diff).toBe(true);
  });
});
