import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import devpost, { DEVPOST_PER_PAGE } from "../../src/adapters/devpost.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const ORIGIN = "https://devpost.com";
const source = findSource("devpost/hackathons");

const hackathon = (n: number, extra: Record<string, unknown> = {}) => ({
  id: n,
  title: `Hack ${n}`,
  url: `https://hack${n}.devpost.com/`,
  open_state: "open",
  ...extra,
});

describe("devpost adapter", () => {
  it("replays the fixture to every open and upcoming hackathon", async () => {
    const { actual } = await replaySource({ source, fetch: fetchSource });
    expect(actual.items.length).toBeGreaterThan(DEVPOST_PER_PAGE);
    expect(actual.items.map((i) => i.title)).toContain("PayPal AI Hackathon");
    expect(new Set(actual.items.map((i) => i.url)).size).toBe(actual.items.length);
  });

  describe("against a stub API", () => {
    let agent: MockAgent;
    beforeEach(() => {
      agent = new MockAgent();
      agent.disableNetConnect();
      agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nDisallow:\n");
    });
    afterEach(async () => {
      agent.assertNoPendingInterceptors();
      await agent.close();
    });
    const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });
    const page = (n: number) =>
      `/api/hackathons?status%5B%5D=upcoming&status%5B%5D=open&per_page=${DEVPOST_PER_PAGE}&page=${n}`;

    it("pages until total_count, builds text from listing fields and drops duplicates", async () => {
      const pool = agent.get(ORIGIN);
      const first = Array.from({ length: DEVPOST_PER_PAGE }, (_, i) => hackathon(i));
      pool
        .intercept({ path: page(1) })
        .reply(200, { hackathons: first, meta: { total_count: DEVPOST_PER_PAGE + 2 } });
      pool.intercept({ path: page(2) }).reply(200, {
        hackathons: [
          hackathon(0),
          hackathon(99, {
            title: "  Lagos   Hack ",
            organization_name: "GDG Lagos",
            open_state: "upcoming",
            submission_period_dates: "Nov 14 - 15, 2026",
            displayed_location: { icon: "map", location: "Lagos, Nigeria" },
            prize_amount: "$<span data-currency-value>1,000</span>",
            prizes_counts: { cash: 3, other: 0 },
            themes: [{ id: 1, name: "Fintech" }],
            time_left_to_submission: "about 1 month left",
            registrations_count: 12,
            invite_only: true,
            eligibility_requirement_invite_only_description: "Students of UNILAG only.",
          }),
        ],
        meta: { total_count: DEVPOST_PER_PAGE + 2 },
      });
      const items = await devpost.fetch(source, http());
      expect(items).toHaveLength(DEVPOST_PER_PAGE + 1);
      expect(items[0]).toEqual({
        url: "https://hack0.devpost.com/",
        title: "Hack 0",
        text: "Status: open",
      });
      expect(items.at(-1)).toEqual({
        url: "https://hack99.devpost.com/",
        title: "Lagos Hack",
        text: [
          "Host: GDG Lagos",
          "Status: upcoming",
          "Submission period: Nov 14 - 15, 2026",
          "Location: Lagos, Nigeria",
          "Prizes: $1,000 (3 cash, 0 other)",
          "Themes: Fintech",
          "Invite only. Students of UNILAG only.",
        ].join("\n"),
        meta: { categories: ["Fintech"] },
      });
    });

    it("stops on an empty page", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: page(1) })
        .reply(200, { hackathons: [], meta: { total_count: 500 } });
      expect(await devpost.fetch(source, http())).toEqual([]);
    });

    it("throws AdapterLayoutChanged when the response shape changes", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: page(1) })
        .reply(200, { challenges: [] });
      await expect(devpost.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
