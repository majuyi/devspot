import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HttpClient,
  type HttpClientOptions,
  HttpRequestFailed,
  HttpStatusError,
  RobotsDisallowed,
  TooManyRedirects,
  USER_AGENT,
} from "../src/http.js";

const ORIGIN = "https://example.org";

let agent: MockAgent;
let clock: number;
let sleeps: number[];

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  clock = 0;
  sleeps = [];
});

afterEach(async () => {
  agent.assertNoPendingInterceptors();
  await agent.close();
});

function client(options: HttpClientOptions = {}): HttpClient {
  return new HttpClient({
    dispatcher: agent,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    random: () => 0.5,
    ...options,
  });
}

function allowAll(origin = ORIGIN): void {
  agent.get(origin).intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nAllow: /\n");
}

describe("retries", () => {
  it("retries a 5xx with backoff, then returns the success", async () => {
    allowAll();
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: "/jobs" }).reply(503, "busy").times(2);
    pool.intercept({ path: "/jobs" }).reply(200, "ok");
    expect(await client({ minIntervalMs: 0 }).text(`${ORIGIN}/jobs`)).toBe("ok");
    // random 0.5 makes jitter a factor of 1: 500ms, then 1000ms.
    expect(sleeps).toEqual([500, 1000]);
  });

  it("does not retry a 4xx", async () => {
    allowAll();
    agent.get(ORIGIN).intercept({ path: "/gone" }).reply(404, "nope");
    await expect(client().text(`${ORIGIN}/gone`)).rejects.toBeInstanceOf(HttpStatusError);
  });

  it("returns a 4xx from get without throwing, for conditional requests", async () => {
    allowAll();
    agent.get(ORIGIN).intercept({ path: "/feed" }).reply(304, "");
    expect((await client().get(`${ORIGIN}/feed`, { "if-none-match": '"v1"' })).status).toBe(304);
  });

  it("retries a network error and gives up with HttpRequestFailed", async () => {
    allowAll();
    agent
      .get(ORIGIN)
      .intercept({ path: "/flaky" })
      .replyWithError(new Error("socket hang up"))
      .times(4);
    const err = await client({ minIntervalMs: 0 })
      .text(`${ORIGIN}/flaky`)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpRequestFailed);
    expect((err as HttpRequestFailed).attempts).toBe(4);
  });

  it("treats a timeout as a network error", async () => {
    allowAll();
    agent.get(ORIGIN).intercept({ path: "/slow" }).reply(200, "late").delay(200).times(2);
    const http = new HttpClient({
      dispatcher: agent,
      timeoutMs: 20,
      retries: 1,
      sleep: async () => {},
    });
    await expect(http.text(`${ORIGIN}/slow`)).rejects.toBeInstanceOf(HttpRequestFailed);
  });
});

describe("rate limit", () => {
  it("spaces requests to one host by the interval", async () => {
    allowAll();
    agent.get(ORIGIN).intercept({ path: "/a" }).reply(200, "a").times(3);
    const http = client({ minIntervalMs: 1000 });
    for (let i = 0; i < 3; i++) await http.text(`${ORIGIN}/a`);
    // robots.txt at t=0, then the three pages at 1000, 2000, 3000.
    expect(sleeps).toEqual([1000, 1000, 1000]);
    expect(clock).toBe(3000);
  });

  it("queues concurrent requests instead of sending them together", async () => {
    allowAll();
    agent.get(ORIGIN).intercept({ path: "/a" }).reply(200, "a").times(3);
    const http = client({ minIntervalMs: 1000 });
    await http.text(`${ORIGIN}/a`);
    await Promise.all([http.text(`${ORIGIN}/a`), http.text(`${ORIGIN}/a`)]);
    expect(clock).toBe(3000);
  });

  it("does not make one host wait for another", async () => {
    allowAll();
    allowAll("https://other.example");
    agent.get(ORIGIN).intercept({ path: "/a" }).reply(200, "a");
    agent.get("https://other.example").intercept({ path: "/b" }).reply(200, "b");
    const http = client({ minIntervalMs: 1000 });
    await http.text(`${ORIGIN}/a`);
    clock = 1000; // the first host's slot has passed; the second host never had one
    await http.text("https://other.example/b");
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("honours a longer robots.txt Crawl-delay", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/robots.txt" })
      .reply(200, "User-agent: *\nCrawl-delay: 2\n");
    agent.get(ORIGIN).intercept({ path: "/a" }).reply(200, "a").times(2);
    const http = client({ minIntervalMs: 1000 });
    await http.text(`${ORIGIN}/a`);
    await http.text(`${ORIGIN}/a`);
    expect(sleeps).toEqual([1000, 2000]);
  });
});

describe("robots.txt", () => {
  it("raises RobotsDisallowed for a disallowed path and allows the rest", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/robots.txt" })
      .reply(200, "User-agent: *\nDisallow: /api/\n");
    agent.get(ORIGIN).intercept({ path: "/events" }).reply(200, "events");
    const http = client();
    await expect(http.text(`${ORIGIN}/api/events`)).rejects.toBeInstanceOf(RobotsDisallowed);
    expect(await http.text(`${ORIGIN}/events`)).toBe("events");
  });

  it("matches the devspot-bot group over the wildcard group", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/robots.txt" })
      .reply(200, "User-agent: *\nAllow: /\n\nUser-agent: devspot-bot\nDisallow: /\n");
    await expect(client().text(`${ORIGIN}/jobs`)).rejects.toBeInstanceOf(RobotsDisallowed);
  });

  it("caches robots.txt per host for the TTL, then refetches", async () => {
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nAllow: /\n");
    pool.intercept({ path: "/a" }).reply(200, "a").times(2);
    const http = client({ minIntervalMs: 0, robotsTtlMs: 10_000 });
    await http.text(`${ORIGIN}/a`);
    await http.text(`${ORIGIN}/a`); // no second robots.txt interceptor: a refetch would throw
    clock = 10_000;
    pool.intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nDisallow: /\n");
    await expect(http.text(`${ORIGIN}/a`)).rejects.toBeInstanceOf(RobotsDisallowed);
  });

  it("treats a missing robots.txt (4xx) as allow all", async () => {
    agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(404, "not found");
    agent.get(ORIGIN).intercept({ path: "/a" }).reply(200, "a");
    expect(await client().text(`${ORIGIN}/a`)).toBe("a");
  });

  it("treats an erroring robots.txt (5xx after retries) as disallow all", async () => {
    agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(500, "oops").times(4);
    await expect(client().text(`${ORIGIN}/a`)).rejects.toBeInstanceOf(RobotsDisallowed);
  });
});

describe("requests", () => {
  it("sends the devspot User-Agent", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/robots.txt", headers: { "user-agent": USER_AGENT } })
      .reply(200, "");
    agent
      .get(ORIGIN)
      .intercept({ path: "/a", headers: { "user-agent": USER_AGENT } })
      .reply(200, "a");
    expect(await client().text(`${ORIGIN}/a`)).toBe("a");
  });

  it("follows a cross-host redirect and checks robots.txt on the new host", async () => {
    allowAll("https://old.example");
    agent
      .get("https://old.example")
      .intercept({ path: "/events" })
      .reply(301, "", { headers: { location: "https://new.example/events" } });
    agent
      .get("https://new.example")
      .intercept({ path: "/robots.txt" })
      .reply(200, "User-agent: *\nDisallow: /events\n");
    await expect(client().text("https://old.example/events")).rejects.toBeInstanceOf(
      RobotsDisallowed,
    );
  });

  it("returns the final URL after a redirect", async () => {
    allowAll();
    agent
      .get(ORIGIN)
      .intercept({ path: "/old" })
      .reply(302, "", { headers: { location: "/new" } });
    agent.get(ORIGIN).intercept({ path: "/new" }).reply(200, "here");
    const res = await client().get(`${ORIGIN}/old`);
    expect(res).toMatchObject({ url: `${ORIGIN}/new`, status: 200, body: "here" });
  });

  it("stops after too many redirects", async () => {
    allowAll();
    agent
      .get(ORIGIN)
      .intercept({ path: "/loop" })
      .reply(302, "", { headers: { location: "/loop" } })
      .times(3);
    await expect(client({ maxRedirects: 2 }).get(`${ORIGIN}/loop`)).rejects.toBeInstanceOf(
      TooManyRedirects,
    );
  });

  it("parses JSON and asks for it", async () => {
    allowAll();
    agent
      .get(ORIGIN)
      .intercept({ path: "/api", headers: { accept: "application/json" } })
      .reply(200, '{"hackathons":[]}');
    expect(await client().json(`${ORIGIN}/api`)).toEqual({ hackathons: [] });
  });
});
