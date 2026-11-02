import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import bamboohr, { BAMBOOHR_DETAIL_LIMIT } from "../../src/adapters/bamboohr.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const ORIGIN = "https://acme.bamboohr.com";
const registered = findSource("flutterwave/careers");
const source = { ...registered, url: `${ORIGIN}/careers/list` };

describe("bamboohr adapter", () => {
  it("replays the Flutterwave fixture to the roles its filter keeps", async () => {
    const { actual } = await replaySource({ source: registered, fetch: fetchSource });
    const titles = actual.items.map((i) => i.title);
    expect(titles).toContain("Data Scientist, Risk");
    expect(titles.some((t) => /senior|manager|head/i.test(t ?? ""))).toBe(false);
    for (const item of actual.items) {
      expect(item.url).toMatch(/^https:\/\/flutterwavego\.bamboohr\.com\/careers\/\d+$/);
      expect(item.text).toMatch(/^Department: .+\nEmployment: .+\nLocation: .+Lagos/);
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
    const list = (jobs: { id: string; title: string; department?: string | null }[]) =>
      agent
        .get(ORIGIN)
        .intercept({ path: "/careers/list" })
        .reply(200, {
          result: jobs.map((j) => ({
            id: j.id,
            jobOpeningName: j.title,
            departmentLabel: j.department ?? null,
          })),
        });
    const detail = (id: string, opening: Record<string, unknown> = {}, status = 200) =>
      agent
        .get(ORIGIN)
        .intercept({ path: `/careers/${id}/detail` })
        .reply(() => {
          details.push(id);
          return {
            statusCode: status,
            data: {
              result: {
                jobOpening: {
                  jobOpeningName: `Role ${id}`,
                  departmentLabel: "Engineering",
                  employmentStatusLabel: "Full-Time",
                  location: { city: "Yaba", state: "Lagos", addressCountry: "Nigeria" },
                  datePosted: "2026-10-28",
                  description: "<p>Build things.</p><ul><li>Two years of Go</li></ul>",
                  ...opening,
                },
              },
            },
          };
        });

    it("builds an item from the role's detail", async () => {
      list([{ id: "7", title: "Backend Engineer", department: "Engineering" }]);
      detail("7", { jobOpeningName: "Backend  Engineer" });
      expect(await bamboohr.fetch({ ...source, filter: undefined }, http())).toEqual([
        {
          url: `${ORIGIN}/careers/7`,
          title: "Backend Engineer",
          text: "Department: Engineering\nEmployment: Full-Time\nLocation: Yaba, Lagos, Nigeria\n\nBuild things.\n\n- Two years of Go",
          publishedAt: "2026-10-28T00:00:00.000Z",
          meta: { department: "Engineering", employment: "Full-Time" },
        },
      ]);
    });

    it("says remote when the role is remote", async () => {
      list([{ id: "8", title: "Mobile Engineer" }]);
      detail("8", { isRemote: true, location: null, atsLocation: { country: "Nigeria" } });
      const [item] = await bamboohr.fetch({ ...source, filter: undefined }, http());
      expect(item?.text).toContain("Location: Remote (Nigeria)");
    });

    it("asks the filter before fetching detail, skips known roles and stops at the cap", async () => {
      const jobs = [
        { id: "1", title: "Senior Backend Engineer", department: "Engineering" },
        { id: "2", title: "Telesales Agent", department: "Sales" },
        { id: "3", title: "Backend Engineer", department: "Engineering" },
        ...Array.from({ length: BAMBOOHR_DETAIL_LIMIT + 2 }, (_, i) => ({
          id: String(100 + i),
          title: "Software Engineer",
          department: null,
        })),
      ];
      list(jobs);
      for (const j of jobs.slice(3)) detail(j.id);
      const items = await bamboohr.fetch(
        { ...source, knownUrls: new Set([`${ORIGIN}/careers/3`]) },
        http(),
      );
      expect(details).not.toContain("1");
      expect(details).not.toContain("2");
      expect(details).not.toContain("3");
      expect(items).toHaveLength(BAMBOOHR_DETAIL_LIMIT);
    });

    it("leaves a role that closed since the list for the next run", async () => {
      list([
        { id: "5", title: "Data Analyst" },
        { id: "6", title: "Data Engineer" },
      ]);
      detail("5", {}, 404);
      detail("6");
      const items = await bamboohr.fetch({ ...source, filter: undefined }, http());
      expect(items.map((i) => i.url)).toEqual([`${ORIGIN}/careers/6`]);
    });

    it("throws AdapterLayoutChanged when the list or a detail changes shape", async () => {
      agent.get(ORIGIN).intercept({ path: "/careers/list" }).reply(200, { jobs: [] });
      await expect(bamboohr.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
      list([{ id: "9", title: "QA Engineer" }]);
      agent.get(ORIGIN).intercept({ path: "/careers/9/detail" }).reply(200, { result: {} });
      await expect(bamboohr.fetch({ ...source, filter: undefined }, http())).rejects.toBeInstanceOf(
        AdapterLayoutChanged,
      );
    });
  });
});
