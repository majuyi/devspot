import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import devpost, { DEVPOST_DETAIL_LIMIT, DEVPOST_PER_PAGE } from "../../src/adapters/devpost.js";
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

const detailPage = (body = "<p>Build something.</p>") => `<html><body>
  <div id="challenge-information"><p>November 12 at 3:00pm EST to deadline</p>
    <p>Deadline: Nov 12, 2026 @ 12:00pm PST</p><p>13304 participants</p></div>
  <div class="requirements-col"><h6>Who can participate</h6><ul id="eligibility-list">
    <li>Ages 18+ only</li>
    <li>All countries/territories, excluding <span title="Cuba, Iran">standard exceptions</span></li>
    <li>Specific <a href="#" data-reveal-id="countries-modal">countries/territories excluded</a></li>
  </ul></div>
  <div id="countries-modal"><ul><li>Brazil</li><li>Quebec</li></ul></div>
  <div id="main"><h2>About the challenge</h2>${body}<a href="/rules">Official rules</a></div>
</body></html>`;

describe("devpost adapter", () => {
  it("replays the fixture: new online hackathons with deadline and eligibility", async () => {
    const { actual } = await replaySource({ source, fetch: fetchSource });
    expect(actual.items).toHaveLength(DEVPOST_DETAIL_LIMIT);
    expect(actual.items.map((i) => i.title)).toContain("PayPal AI Hackathon");
    for (const item of actual.items) {
      expect(item.text).toContain("Location: Online");
      expect(item.text).toMatch(/^Deadline: .+ @ .+$/m);
      expect(item.text).toContain("Who can participate");
    }
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
    const http = () =>
      new HttpClient({ dispatcher: agent, minIntervalMs: 0, retries: 0, sleep: async () => {} });
    const page = (n: number) =>
      `/api/hackathons?status%5B%5D=upcoming&status%5B%5D=open&challenge_type%5B%5D=online&per_page=${DEVPOST_PER_PAGE}&page=${n}`;
    const hackHost = (n: number) => {
      const pool = agent.get(`https://hack${n}.devpost.com`);
      pool.intercept({ path: "/robots.txt" }).reply(404, "");
      return pool;
    };

    it("builds text from the listing and the hackathon's own page", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: page(1) })
        .reply(200, {
          hackathons: [
            hackathon(1, {
              title: "  Lagos   Hack ",
              organization_name: "GDG Lagos",
              submission_period_dates: "Oct 01 - Nov 12, 2026",
              displayed_location: { icon: "globe", location: "Online" },
              prize_amount: "$<span data-currency-value>1,000</span>",
              prizes_counts: { cash: 3, other: 0 },
              themes: [{ id: 1, name: "Fintech" }],
              time_left_to_submission: "about 1 month left",
              registrations_count: 12,
              invite_only: true,
              eligibility_requirement_invite_only_description: "Students of UNILAG only.",
            }),
          ],
          meta: { total_count: 1 },
        });
      hackHost(1)
        .intercept({ path: "/", headers: { accept: "*/*" } })
        .reply(200, detailPage());
      expect(await devpost.fetch(source, http())).toEqual([
        {
          url: "https://hack1.devpost.com/",
          title: "Lagos Hack",
          text: [
            "Host: GDG Lagos",
            "Status: open",
            "Submission period: Oct 01 - Nov 12, 2026",
            "Deadline: Nov 12, 2026 @ 12:00pm PST",
            "Location: Online",
            "Prizes: $1,000 (3 cash, 0 other)",
            "Themes: Fintech",
            "Invite only. Students of UNILAG only.",
            "",
            "Who can participate",
            "",
            "- Ages 18+ only",
            "- All countries/territories, excluding standard exceptions (Cuba, Iran)",
            "- Specific countries/territories excluded (Brazil, Quebec)",
            "",
            "About the challenge",
            "",
            "Build something.",
            "",
            "Official rules",
          ].join("\n"),
          meta: {
            links: [{ text: "Official rules", href: "https://hack1.devpost.com/rules" }],
            categories: ["Fintech"],
          },
        },
      ]);
    });

    it("pages the listing, skips known hackathons and fetches at most the limit", async () => {
      const total = DEVPOST_PER_PAGE + 3;
      const all = Array.from({ length: total }, (_, i) => hackathon(i));
      const pool = agent.get(ORIGIN);
      pool
        .intercept({ path: page(1) })
        .reply(200, { hackathons: all.slice(0, DEVPOST_PER_PAGE), meta: { total_count: total } });
      pool.intercept({ path: page(2) }).reply(200, {
        hackathons: all.slice(DEVPOST_PER_PAGE),
        meta: { total_count: total },
      });
      // hack0 and hack2 are known; the rest are new.
      const known = new Set(["https://hack0.devpost.com/", "https://hack2.devpost.com/"]);
      const expected = [1, ...Array.from({ length: DEVPOST_DETAIL_LIMIT - 1 }, (_, i) => i + 3)];
      for (const n of expected) hackHost(n).intercept({ path: "/" }).reply(200, detailPage());
      const items = await devpost.fetch({ ...source, knownUrls: known }, http());
      expect(items.map((i) => i.url)).toEqual(expected.map((n) => `https://hack${n}.devpost.com/`));
    });

    it("fetches a hackathon listed twice once", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: page(1) })
        .reply(200, { hackathons: [hackathon(1), hackathon(1)], meta: { total_count: 2 } });
      hackHost(1).intercept({ path: "/" }).reply(200, detailPage());
      const items = await devpost.fetch(source, http());
      expect(items.map((i) => i.url)).toEqual(["https://hack1.devpost.com/"]);
    });

    it("skips a hackathon page that 403s, so it is tried again next run", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: page(1) })
        .reply(200, { hackathons: [hackathon(1), hackathon(2)], meta: { total_count: 2 } });
      hackHost(1).intercept({ path: "/" }).reply(403, "Forbidden");
      hackHost(2).intercept({ path: "/" }).reply(200, detailPage());
      const items = await devpost.fetch(source, http());
      expect(items.map((i) => i.url)).toEqual(["https://hack2.devpost.com/"]);
    });

    it("stops on an empty page", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: page(1) })
        .reply(200, { hackathons: [], meta: { total_count: 500 } });
      expect(await devpost.fetch(source, http())).toEqual([]);
    });

    it("throws AdapterLayoutChanged when the API or page shape changes", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: page(1) })
        .reply(200, { challenges: [] });
      const client = http();
      await expect(devpost.fetch(source, client)).rejects.toBeInstanceOf(AdapterLayoutChanged);

      agent
        .get(ORIGIN)
        .intercept({ path: page(1) })
        .reply(200, { hackathons: [hackathon(1)], meta: { total_count: 1 } });
      hackHost(1).intercept({ path: "/" }).reply(200, "<html><body>Redesigned</body></html>");
      await expect(devpost.fetch(source, client)).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
