import { type FetchResult, sourceHealth } from "@devspot/schema";
import { MockAgent } from "undici";
import { describe, expect, it } from "vitest";
import { fetchSource } from "../src/fetch.js";
import { health, runSummary, type SourceCounters, type SourceRun } from "../src/health.js";
import { HttpClient } from "../src/http.js";

const AT = new Date("2026-11-01T06:17:00Z");
const fresh: SourceCounters = {
  consecutiveEmpty: 0,
  consecutiveErrors: 0,
  baselineWeeklyYield: null,
};
const run = (extra: Partial<Parameters<typeof health>[1]> = {}) => ({
  ok: true,
  nNew: 0,
  finishedAt: AT,
  runs: 10,
  ...extra,
});

describe("health counters", () => {
  it("resets errors on an ok run and counts them otherwise", () => {
    const failed = health({ ...fresh, consecutiveErrors: 2 }, run({ ok: false }));
    expect(failed.consecutiveErrors).toBe(3);
    expect(failed.lastOkAt).toBeUndefined();
    const ok = health({ ...fresh, consecutiveErrors: 2 }, run());
    expect(ok.consecutiveErrors).toBe(0);
    expect(ok.lastOkAt).toEqual(AT);
    expect(ok.lastRunAt).toEqual(AT);
  });

  it("resets empties when a run yields and counts them otherwise", () => {
    const empty = health({ ...fresh, consecutiveEmpty: 7 }, run());
    expect(empty.consecutiveEmpty).toBe(8);
    expect(empty.lastYieldAt).toBeUndefined();
    const yielded = health({ ...fresh, consecutiveEmpty: 7 }, run({ nNew: 2 }));
    expect(yielded.consecutiveEmpty).toBe(0);
    expect(yielded.lastYieldAt).toEqual(AT);
  });

  it("moves the baseline by the moving average, once 4 runs exist", () => {
    expect(health(fresh, run({ nNew: 1, runs: 3 })).baselineWeeklyYield).toBeNull();
    expect(health(fresh, run({ nNew: 1, runs: 4 })).baselineWeeklyYield).toBe(28);
    const next = health({ ...fresh, baselineWeeklyYield: 10 }, run({ nNew: 1 }));
    expect(next.baselineWeeklyYield).toBeCloseTo(13.6);
  });

  it("leaves the baseline alone on a failed run", () => {
    const failed = health({ ...fresh, baselineWeeklyYield: 10 }, run({ ok: false }));
    expect(failed.baselineWeeklyYield).toBe(10);
  });
});

describe("sourceHealth", () => {
  const source = { ...fresh, enabled: true };
  it.each([
    ["new under 4 runs", source, 3, "new"],
    ["healthy at 4 runs", source, 4, "healthy"],
    ["erroring at 3 errors", { ...source, consecutiveErrors: 3 }, 20, "erroring"],
    ["erroring beats new", { ...source, consecutiveErrors: 3 }, 3, "erroring"],
    ["still healthy at 2 errors", { ...source, consecutiveErrors: 2 }, 20, "healthy"],
    [
      "stale at 8 empties over a baseline above 1",
      { ...source, consecutiveEmpty: 8, baselineWeeklyYield: 1.1 },
      20,
      "stale",
    ],
    [
      "not stale at 7 empties",
      { ...source, consecutiveEmpty: 7, baselineWeeklyYield: 5 },
      20,
      "healthy",
    ],
    [
      "a quiet source is not stale",
      { ...source, consecutiveEmpty: 50, baselineWeeklyYield: 1 },
      20,
      "healthy",
    ],
    ["no baseline is not stale", { ...source, consecutiveEmpty: 50 }, 20, "healthy"],
    [
      "erroring beats stale",
      { ...source, consecutiveEmpty: 9, consecutiveErrors: 3, baselineWeeklyYield: 5 },
      20,
      "erroring",
    ],
    [
      "disabled beats everything",
      { ...source, enabled: false, consecutiveErrors: 9 },
      20,
      "disabled",
    ],
  ] as const)("%s", (_, state, runs, want) => {
    expect(sourceHealth(state, runs)).toBe(want);
  });
});

describe("a source that returns 500", () => {
  it("reaches erroring after 3 runs", async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    const pool = agent.get("https://broken.example");
    pool.intercept({ path: "/robots.txt" }).reply(404, "");
    pool.intercept({ path: "/feed" }).reply(500, "boom").times(3);
    const http = new HttpClient({
      dispatcher: agent,
      minIntervalMs: 0,
      retries: 0,
      sleep: async () => {},
    });
    const source = {
      key: "broken/feed",
      organizationSlug: "broken",
      kind: "feed",
      url: "https://broken.example/feed",
    } as const;

    let counters = fresh;
    const states: string[] = [];
    for (let runs = 1; runs <= 3; runs++) {
      const result = await fetchSource(source, http).catch(
        (e: Error): FetchResult => ({ items: [], error: e.message }),
      );
      expect(result.error).toBeDefined();
      counters = health(counters, run({ ok: false, runs }));
      states.push(sourceHealth({ ...counters, enabled: true }, runs));
    }
    expect(states).toEqual(["new", "new", "erroring"]);
    await agent.close();
  });
});

describe("runSummary", () => {
  it("adds up sources and names the stale and erroring ones", () => {
    const row = (key: string, extra: Partial<SourceRun>): SourceRun => ({
      key,
      ok: true,
      nNew: 0,
      nChanged: 0,
      published: 0,
      review: 0,
      health: "healthy",
      ...extra,
    });
    const summary = runSummary("r1", [
      row("a/feed", { nNew: 3, nChanged: 1, published: 2, review: 2 }),
      row("b/feed", { ok: false, health: "erroring" }),
      row("c/feed", { nNew: 1, review: 1, health: "stale" }),
    ]);
    expect(summary).toEqual({
      run: "r1",
      sources: 3,
      ok: 2,
      errors: 1,
      new: 4,
      changed: 1,
      published: 2,
      review: 3,
      stale: ["c/feed"],
      erroring: ["b/feed"],
    });
  });
});
