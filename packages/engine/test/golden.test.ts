import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADAPTERS } from "../src/adapters/index.js";
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
    const fetchable = sources
      .filter((s) => s.kind !== "manual" && (!s.adapter || ADAPTERS.has(s.adapter)))
      .map((s) => s.key);
    expect(fetchable.filter((k) => !recorded.includes(k))).toEqual([]);
  });

  it("every adapter is used by a source that has a fixture", () => {
    const covered = new Set(
      sources.filter((s) => s.adapter && recorded.includes(s.key)).map((s) => s.adapter),
    );
    expect([...ADAPTERS.keys()].filter((k) => !covered.has(k))).toEqual([]);
  });

  it("only the known adapters are still unwritten", () => {
    // Registry sources whose adapter does not exist yet; they fail at run time with
    // AdapterNotFound. Remove a name here when its adapter and fixture land.
    const unwritten = sources.filter((s) => s.adapter && !ADAPTERS.has(s.adapter));
    expect(unwritten.map((s) => s.adapter).sort()).toEqual([
      "bamboohr",
      "bevy",
      "mlh",
      "outreachy",
    ]);
  });

  it.each(recorded)("%s replays to expected.json", async (key) => {
    const source = sources.find((s) => s.key === key);
    if (!source) throw new Error(`${key} is not in the registry`);
    const result = await replaySource({ source, fetch: fetchSource });
    expect(result.equal, result.diff).toBe(true);
  });
});
