import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import greenhouse, { GREENHOUSE_DETAIL_LIMIT } from "../../src/adapters/greenhouse.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const API = "https://boards-api.greenhouse.io";
const BOARD = "https://job-boards.eu.greenhouse.io/acme/jobs";
const registered = findSource("moniepoint/careers");
const source = { ...registered, url: `${API}/v1/boards/acme/jobs`, filter: undefined };

type Job = { id: string; title: string; location?: string };

describe("greenhouse adapter", () => {
  it("replays the Moniepoint fixture to Nigerian tech roles", async () => {
    const { actual } = await replaySource({ source: registered, fetch: fetchSource });
    expect(actual.items.map((i) => i.title)).toContain("Hardware Engineer");
    for (const item of actual.items) {
      expect(item.url).toMatch(/^https:\/\/job-boards\.eu\.greenhouse\.io\/moniepoint\/jobs\/\d+$/);
      expect(item.meta?.country).toBe("NG");
      expect(item.text).toMatch(/^Department: .+\nLocation: .*Nigeria/);
    }
  });

  describe("against a stub board", () => {
    let agent: MockAgent;
    let details: string[];
    beforeEach(() => {
      agent = new MockAgent();
      agent.disableNetConnect();
      details = [];
      agent.get(API).intercept({ path: "/robots.txt" }).reply(404, "").persist();
    });
    afterEach(async () => {
      await agent.close();
    });
    const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });
    const job = (j: Job) => ({
      id: Number(j.id),
      title: j.title,
      absolute_url: `${BOARD}/${j.id}`,
      location: { name: j.location ?? "Lagos, Nigeria" },
      first_published: "2026-11-02T09:00:00-04:00",
      application_deadline: null,
    });
    const list = (jobs: Job[]) =>
      agent
        .get(API)
        .intercept({ path: "/v1/boards/acme/jobs" })
        .reply(200, { jobs: jobs.map(job), meta: { total: jobs.length } });
    const detail = (j: Job, extra: Record<string, unknown> = {}, status = 200) =>
      agent
        .get(API)
        .intercept({ path: `/v1/boards/acme/jobs/${j.id}` })
        .reply(() => {
          details.push(j.id);
          return {
            statusCode: status,
            data: {
              ...job(j),
              content:
                "&lt;p&gt;Build the &lt;strong&gt;rails&lt;/strong&gt;.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Go&lt;/li&gt;&lt;/ul&gt;",
              departments: [{ id: 1, name: "Engineering" }],
              ...extra,
            },
          };
        });

    it("builds an item from the role's detail, unescaping its HTML", async () => {
      const j = { id: "7", title: "Backend Engineer" };
      list([j]);
      detail(j, { title: "Backend  Engineer", application_deadline: "2026-12-15T23:59:00Z" });
      const { items } = await greenhouse.fetch(source, http());
      expect(items).toEqual([
        {
          url: `${BOARD}/7`,
          title: "Backend Engineer",
          text: "Department: Engineering\nLocation: Lagos, Nigeria\nDeadline: 15 December 2026\n\nBuild the rails.\n\n- Go",
          publishedAt: "2026-11-02T00:00:00.000Z",
          meta: { department: "Engineering", country: "NG" },
        },
      ]);
    });

    it("asks the filter (title, country) before fetching detail, and stops at the cap", async () => {
      const jobs: Job[] = [
        { id: "1", title: "Software Engineer", location: "Remote, Spain" },
        { id: "2", title: "Field Sales Lead" },
        { id: "3", title: "Known Engineer" },
        { id: "4", title: "Data Analyst", location: "New York" },
        ...Array.from({ length: GREENHOUSE_DETAIL_LIMIT }, (_, i) => ({
          id: String(100 + i),
          title: "Software Engineer",
        })),
      ];
      list(jobs);
      for (const j of jobs.slice(3)) detail(j);
      const { items, listed } = await greenhouse.fetch(
        {
          ...source,
          filter: { titles: ["engineer", "data analyst"], countries: ["NG"], seniority: "early" },
          knownUrls: new Set([`${BOARD}/3`]),
        },
        http(),
      );
      // A location with no country it can name is kept: the board did not say.
      expect(details[0]).toBe("4");
      expect(details).not.toContain("1");
      expect(details).not.toContain("2");
      expect(items).toHaveLength(GREENHOUSE_DETAIL_LIMIT);
      // Every role on the board, filtered, known or over the cap, so none is taken as gone.
      expect(listed).toEqual(jobs.map((j) => `${BOARD}/${j.id}`));
    });

    it("leaves a role that closed since the list for the next run", async () => {
      const gone = { id: "5", title: "Data Engineer" };
      const here = { id: "6", title: "Data Scientist" };
      list([gone, here]);
      detail(gone, {}, 404);
      detail(here);
      const { items } = await greenhouse.fetch(source, http());
      expect(items.map((i) => i.url)).toEqual([`${BOARD}/6`]);
    });

    it("throws AdapterLayoutChanged for a url that is not a board or a changed shape", async () => {
      await expect(
        greenhouse.fetch({ ...source, url: `${API}/v1/boards/acme` }, http()),
      ).rejects.toBeInstanceOf(AdapterLayoutChanged);
      agent.get(API).intercept({ path: "/v1/boards/acme/jobs" }).reply(200, { roles: [] });
      await expect(greenhouse.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
      const j = { id: "9", title: "Designer" };
      list([j]);
      agent.get(API).intercept({ path: "/v1/boards/acme/jobs/9" }).reply(200, { nope: 1 });
      await expect(greenhouse.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
