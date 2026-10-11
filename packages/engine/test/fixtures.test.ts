import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchFn, FetchSource } from "../src/fetch.js";
import { unifiedDiff } from "../src/fixtures/diff.js";
import { FixtureMissing, readExpected } from "../src/fixtures/fixture.js";
import { FixtureContainsCredential, recordSource, scrubExchange } from "../src/fixtures/record.js";
import { replaySource, UnexpectedNetworkAccess } from "../src/fixtures/replay.js";

const ORIGIN = "https://example.org";
const source: FetchSource = {
  key: "example/jobs",
  organizationSlug: "example",
  kind: "html",
  url: `${ORIGIN}/jobs`,
  adapter: "example",
};

/** A stand-in fetcher: one page, one item per line. Real fetchers arrive in M1.3 to M1.5. */
const fetchLines: FetchFn = async (s, http) => {
  const text = await http.text(s.url);
  return text
    .split("\n")
    .filter(Boolean)
    .map((line, i) => ({ url: `${s.url}#${i}`, title: line, text: line }));
};

let root: string;
let live: MockAgent;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "devspot-fixtures-"));
  live = new MockAgent();
  live.disableNetConnect();
  live.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nAllow: /\n");
});

afterEach(async () => {
  await live.close();
  rmSync(root, { recursive: true, force: true });
});

function record(fetch: FetchFn = fetchLines) {
  return recordSource({
    source,
    fetch,
    dispatcher: live,
    root,
    httpOptions: { minIntervalMs: 0 },
    now: () => new Date("2026-10-11T00:00:00Z"),
  });
}

describe("record", () => {
  it("writes http.json.gz and expected.json", async () => {
    live
      .get(ORIGIN)
      .intercept({ path: "/jobs" })
      .reply(200, "Backend Intern\nDesign Fellow\n", {
        headers: { "content-type": "text/plain", "set-cookie": "session=abc" },
      });
    const result = await record();
    expect(result).toMatchObject({ exchanges: 2, items: 2, oversized: [] });

    const dir = join(root, "example__jobs");
    const http = JSON.parse(gunzipSync(readFileSync(join(dir, "http.json.gz"))).toString("utf8"));
    expect(http.exchanges.map((e: { url: string }) => e.url)).toEqual([
      `${ORIGIN}/robots.txt`,
      `${ORIGIN}/jobs`,
    ]);
    expect(http.exchanges[1].headers["set-cookie"]).toBeUndefined();
    expect(http.exchanges[1].headers["content-type"]).toBe("text/plain");
    expect(readExpected(dir).items.map((i) => i.title)).toEqual([
      "Backend Intern",
      "Design Fellow",
    ]);
  });

  it("refuses a body containing a bearer token and writes nothing", async () => {
    live
      .get(ORIGIN)
      .intercept({ path: "/jobs" })
      .reply(200, 'fetch("/api", { headers: { Authorization: "Bearer abc" } })');
    const err = await record().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FixtureContainsCredential);
    expect((err as FixtureContainsCredential).url).toBe(`${ORIGIN}/jobs`);
    expect((err as Error).message).toMatch(/Bearer abc/);
    expect(existsSync(join(root, "example__jobs"))).toBe(false);
  });

  it("rejects fetcher output that is not RawItemInput", async () => {
    live.get(ORIGIN).intercept({ path: "/jobs" }).reply(200, "x");
    const bad: FetchFn = async (s, http) => {
      await http.text(s.url);
      return [{ url: "not a url", text: "x" }];
    };
    await expect(record(bad)).rejects.toThrow();
    expect(existsSync(join(root, "example__jobs"))).toBe(false);
  });
});

describe("scrubExchange", () => {
  const base = { method: "GET" as const, url: `${ORIGIN}/a`, status: 200, body: "fine" };

  it("drops cookie and auth headers and masks credential-shaped values", () => {
    const out = scrubExchange("example/jobs", {
      ...base,
      headers: {
        authorization: "Basic dXNlcjpwYXNz",
        "x-debug": "token=Bearer xyz123",
        etag: '"v1"',
      },
    });
    expect(out.headers).toEqual({ "x-debug": "[scrubbed]", etag: '"v1"' });
  });

  it.each([
    'apiKey: "abcdef123456"',
    "AKIAABCDEFGHIJKLMNOP",
    `ghp_${"a".repeat(36)}`,
    `sk-ant-${"b".repeat(30)}`,
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.c2lnbmF0dXJlXzEyMw",
  ])("refuses a body containing %s", (secret) => {
    expect(() =>
      scrubExchange("example/jobs", { ...base, headers: {}, body: `x ${secret} y` }),
    ).toThrow(FixtureContainsCredential);
  });
});

describe("replay", () => {
  async function recorded(body = "Backend Intern\n") {
    live.get(ORIGIN).intercept({ path: "/jobs" }).reply(200, body);
    await record();
  }

  it("reproduces expected.json with no network", async () => {
    await recorded();
    const result = await replaySource({ source, fetch: fetchLines, root });
    expect(result.equal).toBe(true);
  });

  it("throws UnexpectedNetworkAccess for a request with no recorded key", async () => {
    await recorded();
    const strays: FetchFn = async (_s, http) => {
      await http.text(`${ORIGIN}/jobs?page=2`);
      return [];
    };
    await expect(replaySource({ source, fetch: strays, root })).rejects.toBeInstanceOf(
      UnexpectedNetworkAccess,
    );
  });

  it("throws UnexpectedNetworkAccess, not RobotsDisallowed, when a host was never recorded", async () => {
    await recorded();
    const elsewhere: FetchFn = async (_s, http) => {
      await http.text("https://elsewhere.example/jobs");
      return [];
    };
    await expect(replaySource({ source, fetch: elsewhere, root })).rejects.toBeInstanceOf(
      UnexpectedNetworkAccess,
    );
  });

  it("throws FixtureMissing when the source was never recorded", async () => {
    await expect(replaySource({ source, fetch: fetchLines, root })).rejects.toBeInstanceOf(
      FixtureMissing,
    );
  });

  it("reports a diff when the fetcher's output changes", async () => {
    await recorded();
    const renamed: FetchFn = async (s, http) =>
      (await fetchLines(s, http)).map((i) => ({ ...i, title: `${i.title} 2027` }));
    const result = await replaySource({ source, fetch: renamed, root });
    expect(result.equal).toBe(false);
    expect(result.diff).toContain('-       "title": "Backend Intern",');
    expect(result.diff).toContain('+       "title": "Backend Intern 2027",');
  });
});

describe("network in tests", () => {
  it("blocks the global fetch, so a stray call cannot reach the internet", async () => {
    const err = await fetch("https://example.org/").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const cause = (err as Error & { cause?: unknown }).cause ?? err;
    expect(cause).toBeInstanceOf(UnexpectedNetworkAccess);
  });
});

describe("unifiedDiff", () => {
  it("is empty of changes for equal input and marks changed lines", () => {
    expect(unifiedDiff("a\nb", "a\nb")).toBe("");
    expect(unifiedDiff("a\nb\nc", "a\nB\nc")).toBe("  a\n- b\n+ B\n  c");
  });
});
