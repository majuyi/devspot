import { resolve } from "node:path";
import type { PrismaClient } from "@devspot/db";
import type { FetchResult, RawItemInput } from "@devspot/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { dryRun, hasFetcher, selectSources } from "../src/dry-run.js";
import type { FetchFn, FetchSource } from "../src/fetch.js";
import { fixtureDir, readHttpFixture } from "../src/fixtures/fixture.js";
import { ReplayDispatcher } from "../src/fixtures/replay.js";
import { HttpClient, HttpStatusError } from "../src/http.js";
import { findSource, UnknownSource } from "../src/registry.js";
import type { runEngine as RunEngine, sourceStates as SourceStates } from "../src/run.js";

// Needs the Docker database, as test/raw-items.test.ts does.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch {}
}
const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb && process.env.CI) throw new Error("DATABASE_URL must be set in CI");

const NOW = new Date("2026-10-13T12:00:00Z");

type Logged = { event: string; fields: Record<string, unknown> };
const logger = () => {
  const lines: Logged[] = [];
  return { lines, log: (event: string, fields = {}) => void lines.push({ event, fields }) };
};

describe("selectSources", () => {
  const sources = [
    { key: "a/feed", organizationSlug: "a" },
    { key: "a/site", organizationSlug: "a" },
    { key: "b/feed", organizationSlug: "b" },
  ];
  it("filters by source and by organization", () => {
    expect(selectSources(sources, {})).toHaveLength(3);
    expect(selectSources(sources, { org: "a" })).toHaveLength(2);
    expect(selectSources(sources, { source: "b/feed" })).toEqual([sources[2]]);
  });
  it("refuses a filter that matches nothing", () => {
    expect(() => selectSources(sources, { source: "typo/feed" })).toThrow(UnknownSource);
    expect(() => selectSources(sources, { org: "typo" })).toThrow(UnknownSource);
  });
});

describe("hasFetcher", () => {
  it("is true without an adapter or with a written one", () => {
    expect(hasFetcher({ key: "x", organizationSlug: "x" })).toBe(true);
    expect(hasFetcher({ key: "x", organizationSlug: "x", adapter: "hng" })).toBe(true);
  });
  it("is false for an adapter nobody has written", () => {
    expect(hasFetcher({ key: "x", organizationSlug: "x", adapter: "bevy" })).toBe(false);
  });
});

describe("dry run against a fixture", () => {
  const client = (key: string) =>
    new HttpClient({
      dispatcher: new ReplayDispatcher(readHttpFixture(fixtureDir(key))),
      minIntervalMs: 0,
      retries: 0,
      sleep: async () => {},
    });

  it("prints a draft per item and needs no database", async () => {
    const { lines, log } = logger();
    const result = await dryRun({
      source: "hng/site",
      sources: [findSource("hng/site")],
      http: client("hng/site"),
      now: NOW,
      log,
    });
    expect(result).toEqual({ sources: 1, drafts: 1, errors: 0 });
    const [line] = lines;
    expect(line?.event).toBe("draft");
    expect(line?.fields).toMatchObject({
      source: "hng/site",
      draft: { title: "HNG Internship 15", kind: "internship" },
    });
  });

  it("stops at --limit", async () => {
    const { lines, log } = logger();
    await dryRun({
      source: "devpost/hackathons",
      sources: [findSource("devpost/hackathons")],
      http: client("devpost/hackathons"),
      now: NOW,
      log,
      limit: 2,
    });
    expect(lines.filter((l) => l.event === "draft")).toHaveLength(2);
  });

  it("carries on past a failing source, skips an unwritten adapter and a disabled source", async () => {
    const { lines, log } = logger();
    const hng = findSource("hng/site");
    const fetch: FetchFn = async (s) => {
      if (s.key === "bad/site") throw new Error("boom");
      return { items: [{ url: "https://a.example/x", title: "Some Fellowship", text: "Text" }] };
    };
    const result = await dryRun({
      sources: [
        { ...hng, key: "bad/site", organizationSlug: "bad", adapter: undefined },
        { ...hng, key: "off/site", enabled: false },
        { ...hng, key: "todo/site", adapter: "bevy" },
        { ...hng, key: "good/site", adapter: undefined },
      ],
      http: new HttpClient(),
      fetch,
      now: NOW,
      log,
    });
    expect(result).toEqual({ sources: 2, drafts: 1, errors: 1 });
    expect(lines.map((l) => l.event)).toEqual(["source.failed", "source.skipped", "draft"]);
  });
});

describe.skipIf(!hasDb)("engine run against Postgres", () => {
  let db: PrismaClient;
  let runEngine: typeof RunEngine;
  let sourceStates: typeof SourceStates;
  const org = `test-run-${process.pid}-${Date.now()}`;
  const key = (name: string) => `${org}/${name}`;
  const http = new HttpClient();

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    ({ runEngine, sourceStates } = await import("../src/run.js"));
  });
  beforeEach(async () => {
    await db.opportunity.deleteMany({ where: { organization: { slug: org } } });
    await db.organization.deleteMany({ where: { slug: org } });
    await db.organization.create({
      data: {
        slug: org,
        name: "Run test",
        category: "hackathonHost",
        homepageUrl: "https://example.org",
        country: "NG",
        registryHash: "test",
        sources: {
          create: [
            { key: key("broken"), kind: "feed", url: "https://example.org/broken" },
            { key: key("good"), kind: "feed", url: "https://example.org/good" },
            { key: key("off"), kind: "feed", url: "https://example.org/off", enabled: false },
            { key: key("todo"), kind: "html", url: "https://example.org/t", adapter: "bevy" },
            { key: key("hand"), kind: "manual", url: "https://example.org/h" },
          ],
        },
      },
    });
  });
  afterAll(async () => {
    await db?.opportunity.deleteMany({ where: { organization: { slug: org } } });
    await db?.organization.deleteMany({ where: { slug: org } });
    await db?.$disconnect();
  });

  const hackathon = (path: string, extra: Partial<RawItemInput> = {}): RawItemInput => ({
    url: `https://example.org/${org}/${path}`,
    title: `${path} Hackathon`,
    text: "Location: Online\nDeadline: 30 November 2026\n\nRequirements\n\nBe 18 or over.",
    ...extra,
  });
  const failing: FetchFn = async (s) => {
    if (s.key === key("broken")) throw new HttpStatusError(s.url, 500);
    return { items: [hackathon("one")], validators: { etag: '"v1"' }, httpStatus: 200 };
  };
  const run = (fetch: FetchFn, extra: { limit?: number } = {}) =>
    runEngine({ db, http, fetch, org, now: () => NOW, log: () => {}, ...extra });
  const source = (name: string) =>
    db.source.findUniqueOrThrow({ where: { key: key(name) }, include: { fetchRuns: true } });

  it("one failing source never stops the run", async () => {
    const { summary, turnedErroring } = await run(failing);
    expect(summary).toMatchObject({
      sources: 2,
      ok: 1,
      errors: 1,
      new: 1,
      changed: 0,
      published: 1,
      review: 0,
    });
    expect(turnedErroring).toEqual([]);
    const opp = await db.opportunity.findFirstOrThrow({ where: { organization: { slug: org } } });
    expect(opp).toMatchObject({ status: "published", kind: "hackathon", discoveredVia: "feed" });
    expect(opp.rawItemId).not.toBeNull();
  });

  it("writes a FetchRun and health for each source, and validators after a 200", async () => {
    await run(failing);
    const good = await source("good");
    expect(good).toMatchObject({
      etag: '"v1"',
      lastOkAt: NOW,
      lastYieldAt: NOW,
      consecutiveErrors: 0,
    });
    expect(good.fetchRuns).toMatchObject([{ ok: true, nFound: 1, nNew: 1, httpStatus: 200 }]);
    const broken = await source("broken");
    expect(broken).toMatchObject({ etag: null, lastOkAt: null, consecutiveErrors: 1 });
    expect(broken.fetchRuns).toMatchObject([{ ok: false, httpStatus: 500 }]);
    expect(broken.fetchRuns[0]?.error).toContain("HTTP 500");
  });

  it("leaves disabled, manual and unwritten sources alone", async () => {
    await run(failing);
    for (const name of ["off", "todo", "hand"]) expect((await source(name)).fetchRuns).toEqual([]);
  });

  it("reports a source as turned erroring on the third run and only then", async () => {
    const turned = [];
    for (let i = 0; i < 4; i++) turned.push((await run(failing)).turnedErroring);
    expect(turned).toEqual([[], [], [key("broken")], []]);
    const { summary } = await run(failing);
    expect(summary.erroring).toEqual([key("broken")]);
    const states = (await sourceStates(db)).filter((s) => s.key.startsWith(org));
    expect(states[0]).toMatchObject({ key: key("broken"), health: "erroring" });
    expect(states.find((s) => s.key === key("off"))?.health).toBe("disabled");
  });

  it("passes what it knows to the fetcher, and an unchanged item costs nothing", async () => {
    const seen: FetchSource[] = [];
    const fetch: FetchFn = async (s) => {
      seen.push(s);
      return s.key === key("good")
        ? { items: [hackathon("one")], validators: { etag: '"v1"' } }
        : { items: [] };
    };
    await run(fetch);
    const { summary } = await run(fetch);
    expect(summary).toMatchObject({ new: 0, changed: 0, published: 0 });
    const second = seen.filter((s) => s.key === key("good"))[1];
    expect(second?.validators).toEqual({ etag: '"v1"' });
    expect([...(second?.knownUrls ?? [])]).toEqual([`https://example.org/${org}/one`]);
  });

  it("updates the opportunity when the page changes", async () => {
    const page =
      (text: string): FetchFn =>
      async (s): Promise<FetchResult> =>
        s.key === key("good") ? { items: [hackathon("one", { text })] } : { items: [] };
    await run(page(hackathon("one").text));
    const { summary } = await run(
      page("Location: Online\nDeadline: 15 December 2026\n\nRequirements\n\nBe 18 or over."),
    );
    expect(summary.changed).toBe(1);
    const opp = await db.opportunity.findFirstOrThrow({ where: { organization: { slug: org } } });
    expect(opp.deadlineAt?.toISOString()).toBe("2026-12-15T22:59:00.000Z");
  });

  it("sends an item it cannot place to review, and counts it", async () => {
    const fetch: FetchFn = async (s) =>
      s.key === key("good")
        ? { items: [{ url: "https://example.org/odd", title: "News", text: "Words." }] }
        : { items: [] };
    const { summary } = await run(fetch);
    expect(summary).toMatchObject({ published: 0, review: 1 });
  });

  it("--limit cuts items before they are stored", async () => {
    const fetch: FetchFn = async (s) =>
      s.key === key("good") ? { items: [hackathon("a"), hackathon("b")] } : { items: [] };
    await run(fetch, { limit: 1 });
    expect(await db.rawItem.count({ where: { source: { key: key("good") } } })).toBe(1);
  });

  it("drops what the source's filter excludes before it is stored, then applies --limit", async () => {
    await db.source.update({
      where: { key: key("good") },
      data: { filter: { departments: ["Engineering"], seniority: "early" } },
    });
    const role = (path: string, department: string, title = `${path} Engineer`) =>
      hackathon(path, { title, meta: { department } });
    const fetch: FetchFn = async (s) =>
      s.key === key("good")
        ? {
            items: [
              role("sales", "Sales", "Sales Associate"),
              role("senior", "Engineering", "Senior Backend Engineer"),
              role("backend", "Engineering"),
              role("mobile", "Engineering"),
            ],
          }
        : { items: [] };
    const seen: FetchSource[] = [];
    await run(
      async (s, h) => {
        seen.push(s);
        return fetch(s, h);
      },
      { limit: 1 },
    );
    expect(seen.find((s) => s.key === key("good"))?.filter).toEqual({
      departments: ["Engineering"],
      seniority: "early",
    });
    const stored = await db.rawItem.findMany({ where: { source: { key: key("good") } } });
    expect(stored.map((r) => r.title)).toEqual(["backend Engineer"]);
    expect((await source("good")).fetchRuns).toMatchObject([{ ok: true, nFound: 1, nNew: 1 }]);
  });

  it("fails the source, not the run, when its stored filter does not parse", async () => {
    await db.source.update({ where: { key: key("good") }, data: { filter: { departments: [] } } });
    const { summary } = await run(failing);
    expect(summary).toMatchObject({ ok: 0, errors: 2 });
    expect((await source("good")).fetchRuns[0]?.error).toContain("Source.filter does not parse");
  });
});
