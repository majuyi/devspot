import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import workable, { WORKABLE_DETAIL_LIMIT } from "../../src/adapters/workable.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const ORIGIN = "https://apply.workable.com";
const registered = findSource("kuda/careers");
const source = { ...registered, url: `${ORIGIN}/api/v1/widget/accounts/acme`, filter: undefined };

type Job = {
  title: string;
  shortcode: string;
  department?: string;
  country?: string;
  experience?: string;
};

describe("workable adapter", () => {
  it("replays the Kuda fixture to Nigerian tech roles", async () => {
    const { actual } = await replaySource({ source: registered, fetch: fetchSource });
    expect(actual.items.length).toBeGreaterThan(0);
    for (const item of actual.items) {
      expect(item.url).toMatch(/^https:\/\/apply\.workable\.com\/j\/[A-Z0-9]+$/);
      expect(item.meta?.country).toBe("NG");
      expect(item.text).toMatch(/Location: .*Lagos/);
    }
  });

  describe("against a stub board", () => {
    let agent: MockAgent;
    let details: string[];
    beforeEach(() => {
      agent = new MockAgent();
      agent.disableNetConnect();
      details = [];
      agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(404, "").persist();
    });
    afterEach(async () => {
      await agent.close();
    });
    const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });
    const list = (jobs: Job[]) =>
      agent
        .get(ORIGIN)
        .intercept({ path: "/api/v1/widget/accounts/acme" })
        .reply(200, {
          jobs: jobs.map((j) => ({
            title: j.title,
            shortcode: j.shortcode,
            url: `${ORIGIN}/j/${j.shortcode}`,
            department: j.department ?? null,
            employment_type: "Full-time",
            experience: j.experience ?? "",
            telecommuting: false,
            published_on: "2026-10-31",
            locations: [
              {
                city: "Lagos",
                region: "Lagos",
                country: "Nigeria",
                countryCode: j.country ?? "NG",
              },
            ],
          })),
        });
    const detail = (code: string, extra: Record<string, unknown> = {}, status = 200) =>
      agent
        .get(ORIGIN)
        .intercept({ path: `/api/v2/accounts/acme/jobs/${code}` })
        .reply(() => {
          details.push(code);
          return {
            statusCode: status,
            data: {
              title: `Role ${code}`,
              description: "<p>Build the app.</p>",
              requirements: "<ul><li>Swift</li></ul>",
              benefits: "<ul><li>Health insurance</li></ul>",
              workplace: "hybrid",
              location: { city: "Lagos", region: "Lagos", country: "Nigeria", countryCode: "NG" },
              ...extra,
            },
          };
        });

    it("builds an item from the list and the role's detail", async () => {
      list([
        {
          title: "iOS Engineer",
          shortcode: "AB12",
          department: "Engineering",
          experience: "Entry level",
        },
      ]);
      detail("AB12", { title: "iOS  Engineer" });
      expect(await workable.fetch(source, http())).toEqual([
        {
          url: `${ORIGIN}/j/AB12`,
          title: "iOS Engineer",
          text: "Department: Engineering\nEmployment: Full-time\nLevel: Entry level\nLocation: Hybrid (Lagos, Nigeria)\n\nBuild the app.\n\nRequirements\n\n- Swift\n\nBenefits\n\n- Health insurance",
          publishedAt: "2026-10-31T00:00:00.000Z",
          meta: { department: "Engineering", country: "NG", level: "Entry level" },
        },
      ]);
    });

    it("writes an on-site location without a mode", async () => {
      list([{ title: "QA Engineer", shortcode: "QA1" }]);
      detail("QA1", { workplace: "on_site" });
      const [item] = await workable.fetch(source, http());
      expect(item?.text).toContain("Location: Lagos, Nigeria\n");
    });

    it("asks the filter (title, country, level) before fetching detail, and stops at the cap", async () => {
      const jobs: Job[] = [
        { title: "Java Developer", shortcode: "RU1", country: "RU" },
        { title: "Data Analyst", shortcode: "MS1", experience: "Mid-Senior level" },
        { title: "Telesales Agent", shortcode: "TS1" },
        { title: "Known Engineer", shortcode: "KN1" },
        ...Array.from({ length: WORKABLE_DETAIL_LIMIT + 1 }, (_, i) => ({
          title: "Software Engineer",
          shortcode: `SE${i}`,
        })),
      ];
      list(jobs);
      for (const j of jobs.slice(4)) detail(j.shortcode);
      const items = await workable.fetch(
        {
          ...source,
          filter: {
            titles: ["engineer", "developer", "data analyst"],
            countries: ["NG"],
            seniority: "early",
          },
          knownUrls: new Set([`${ORIGIN}/j/KN1`]),
        },
        http(),
      );
      expect(details.filter((d) => !d.startsWith("SE"))).toEqual([]);
      expect(items).toHaveLength(WORKABLE_DETAIL_LIMIT);
    });

    it("leaves a role that closed since the list for the next run", async () => {
      list([
        { title: "Data Engineer", shortcode: "GONE" },
        { title: "Data Scientist", shortcode: "HERE" },
      ]);
      detail("GONE", {}, 404);
      detail("HERE");
      expect((await workable.fetch(source, http())).map((i) => i.url)).toEqual([
        `${ORIGIN}/j/HERE`,
      ]);
    });

    it("throws AdapterLayoutChanged for a url without a company or a changed shape", async () => {
      await expect(
        workable.fetch({ ...source, url: `${ORIGIN}/kuda` }, http()),
      ).rejects.toBeInstanceOf(AdapterLayoutChanged);
      agent
        .get(ORIGIN)
        .intercept({ path: "/api/v1/widget/accounts/acme" })
        .reply(200, { roles: [] });
      await expect(workable.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
      list([{ title: "Designer", shortcode: "D1" }]);
      agent
        .get(ORIGIN)
        .intercept({ path: "/api/v2/accounts/acme/jobs/D1" })
        .reply(200, { nope: 1 });
      await expect(workable.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
