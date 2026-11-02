import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import zindi, { utcLine, ZINDI_PER_PAGE } from "../../src/adapters/zindi.js";
import { extractRules } from "../../src/extract/rules.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const API = "https://api.zindi.world";
const source = findSource("zindi/competitions");

describe("utcLine", () => {
  it("writes the API's instant in UTC, to the minute", () => {
    expect(utcLine("2026-12-13T12:00:00.000Z")).toBe("13 December 2026, 12:00 UTC");
    expect(utcLine("2026-11-10T18:29:59.000Z")).toBe("10 November 2026, 18:29 UTC");
    expect(utcLine(null)).toBeUndefined();
    expect(utcLine("soon")).toBeUndefined();
  });
});

describe("zindi adapter", () => {
  it("replays the fixture to open competitions whose deadline the rules read exactly", async () => {
    const { actual } = await replaySource({ source, fetch: fetchSource });
    expect(actual.items.length).toBeGreaterThan(0);
    for (const item of actual.items) {
      expect(item.url).toMatch(/^https:\/\/zindi\.africa\/competitions\/[a-z0-9-]+$/);
      const line = item.text.match(/^Deadline: (.+)$/m)?.[1];
      expect(line).toMatch(/ UTC$/);
      const { draft } = extractRules({
        item: {
          title: item.title ?? null,
          text: item.text,
          canonicalUrl: item.url,
          publishedAt: null,
          meta: undefined,
        },
        org: { category: "hackathonHost", country: "ZA" },
        now: new Date("2026-11-02T00:00:00Z"),
      });
      expect(draft.locationMode).toBe("remote");
      expect(utcLine(draft.deadlineAt ?? null)).toBe(line);
    }
  });

  describe("against a stub API", () => {
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
    const page = (n: number, data: { id: string; open: boolean }[], openCount: number) =>
      agent
        .get(API)
        .intercept({ path: `/v1/competitions?page=${n}&per_page=${ZINDI_PER_PAGE}` })
        .reply(200, {
          data: data.map((c) => ({ ...c, title: c.id })),
          meta: { open_count: openCount },
        });
    const detail = (id: string, extra: Record<string, unknown> = {}, status = 200) =>
      agent
        .get(API)
        .intercept({ path: `/v1/competitions/${id}` })
        .reply(() => {
          details.push(id);
          return {
            statusCode: status,
            data: {
              data: {
                id,
                title: `Challenge  ${id}`,
                subtitle: "Can you predict it?",
                start_time: "2026-10-01T08:00:00.000Z",
                end_time: "2026-12-01T23:59:00.000Z",
                entries_close_at: null,
                reward: "$1 000 USD",
                difficulty: ["Beginner"],
                skills: ["Classification"],
                is_access_restricted: false,
                secret_code_required: false,
                pages: [{ title: "Description", content_html: "<p>Predict rainfall.</p>" }],
                rules: {
                  content: {
                    blocks: [
                      { text: "Who can compete: Open to all", type: "unordered-list-item" },
                      { text: "Teams of up to 4.", type: "unstyled" },
                    ],
                  },
                },
                ...extra,
              },
            },
          };
        });
    const filler = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `old-${i}`, open: false }));

    it("builds an item with the description and rules", async () => {
      page(0, [{ id: "rain", open: true }, ...filler(3)], 1);
      detail("rain");
      expect(await zindi.fetch(source, http())).toEqual([
        {
          url: "https://zindi.africa/competitions/rain",
          title: "Challenge rain",
          text: [
            "Host: Zindi\nLocation: Online\nStarts: 1 October 2026, 08:00 UTC\nDeadline: 1 December 2026, 23:59 UTC\nPrize: $1 000 USD\nDifficulty: Beginner\nSkills: Classification",
            "Can you predict it?",
            "Description\n\nPredict rainfall.",
            "Rules\n\n- Who can compete: Open to all\nTeams of up to 4.",
          ].join("\n\n"),
        },
      ]);
    });

    it("takes the entry deadline when entries close before the end, and says restricted", async () => {
      page(0, [{ id: "early", open: true }], 1);
      detail("early", {
        entries_close_at: "2026-11-20T23:59:00.000Z",
        is_access_restricted: true,
      });
      const [item] = await zindi.fetch(source, http());
      expect(item?.text).toContain(
        "Deadline: 20 November 2026, 23:59 UTC\nCompetition ends: 1 December 2026, 23:59 UTC",
      );
      expect(item?.text).toContain("Access: Zindi marks this competition as restricted.");
    });

    it("reads pages until it has every open competition, and skips known ones", async () => {
      page(0, [{ id: "a", open: true }, ...filler(ZINDI_PER_PAGE - 1)], 3);
      page(1, [{ id: "b", open: true }, { id: "c", open: true }, ...filler(ZINDI_PER_PAGE - 2)], 3);
      detail("a");
      detail("c");
      const items = await zindi.fetch(
        { ...source, knownUrls: new Set(["https://zindi.africa/competitions/b"]) },
        http(),
      );
      expect(details).toEqual(["a", "c"]);
      expect(items.map((i) => i.url)).toEqual([
        "https://zindi.africa/competitions/a",
        "https://zindi.africa/competitions/c",
      ]);
    });

    it("leaves a competition whose page fails for the next run", async () => {
      page(
        0,
        [
          { id: "gone", open: true },
          { id: "here", open: true },
        ],
        2,
      );
      detail("gone", {}, 404);
      detail("here");
      expect((await zindi.fetch(source, http())).map((i) => i.url)).toEqual([
        "https://zindi.africa/competitions/here",
      ]);
    });

    it("throws AdapterLayoutChanged when the list or a detail changes shape", async () => {
      agent
        .get(API)
        .intercept({ path: `/v1/competitions?page=0&per_page=${ZINDI_PER_PAGE}` })
        .reply(200, { competitions: [] });
      await expect(zindi.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
      page(0, [{ id: "x", open: true }], 1);
      agent.get(API).intercept({ path: "/v1/competitions/x" }).reply(200, { data: {} });
      await expect(zindi.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
