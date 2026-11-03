import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import mlh from "../../src/adapters/mlh.js";
import { extractRules } from "../../src/extract/rules.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const ORIGIN = "https://www.mlh.com";
const source = findSource("mlh/season-events");
const page = (data: unknown) =>
  `<html><body><div id="app"></div><script data-page="app" type="application/json">${JSON.stringify(data)}</script></body></html>`;

const rules = (title: string, text: string) =>
  extractRules({
    item: { title, text, canonicalUrl: "https://example.com", publishedAt: null, meta: undefined },
    org: { category: "hackathonHost", country: "US" },
    now: new Date("2026-11-03T00:00:00Z"),
  }).draft;

describe("mlh adapter", () => {
  it("replays the season to its online and hybrid events, never in-person ones", async () => {
    const { actual } = await replaySource({ source, fetch: fetchSource });
    expect(actual.items.map((i) => i.title)).toContain("Solana Hackathon");
    for (const item of actual.items) {
      expect(item.text).toMatch(/^Date: \d{1,2} \w+ 20\d\d, \d\d:\d\d UTC$/m);
      expect(item.text).toMatch(/^Location: (?:Online|Hybrid, online or in person in .+)$/m);
      const draft = rules(item.title ?? "", item.text);
      expect(["remote", "hybrid"]).toContain(draft.locationMode);
      // MLH states when an event runs, not when registration closes.
      expect(draft.deadlineAt ?? null).toBeNull();
    }
  });

  describe("against a stub page", () => {
    let agent: MockAgent;
    beforeEach(() => {
      agent = new MockAgent();
      agent.disableNetConnect();
      agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(404, "").persist();
    });
    afterEach(async () => {
      await agent.close();
    });
    const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });
    const event = (name: string, formatType: string, extra: Record<string, unknown> = {}) => ({
      name,
      formatType,
      startsAt: "2026-11-06T17:00:00Z",
      endsAt: "2026-11-08T17:00:00Z",
      url: `/events/${name}/prizes`,
      websiteUrl: `https://${name}.example.com/`,
      location: "Cincinnati , Ohio",
      customFields: { underserved_types: [], hackathon_focus: [] },
      ...extra,
    });
    const season = (events: unknown[]) =>
      agent
        .get(ORIGIN)
        .intercept({ path: "/seasons/2027/events" })
        .reply(200, page({ props: { upcomingEvents: events, pastEvents: [] } }));

    it("keeps online and hybrid events and builds text from the listing", async () => {
      season([
        event("online", "digital", {
          location: "Everywhere, Worldwide",
          customFields: { underserved_types: ["Women"], hackathon_focus: ["Software"] },
        }),
        event("campus", "physical"),
        event("both", "hybrid_physical", { websiteUrl: null }),
      ]);
      expect(await mlh.fetch(source, http())).toEqual([
        {
          url: "https://online.example.com/",
          title: "online",
          text: "Host: Major League Hacking (MLH member event)\nDate: 6 November 2026, 17:00 UTC\nEnds: 8 November 2026, 17:00 UTC\nLocation: Online\nFocus: Software\nDiversity focus: Women",
        },
        {
          url: `${ORIGIN}/events/both/prizes`,
          title: "both",
          text: "Host: Major League Hacking (MLH member event)\nDate: 6 November 2026, 17:00 UTC\nEnds: 8 November 2026, 17:00 UTC\nLocation: Hybrid, online or in person in Cincinnati, Ohio",
        },
      ]);
    });

    it("throws AdapterLayoutChanged without the data-page script or with a changed shape", async () => {
      agent.get(ORIGIN).intercept({ path: "/seasons/2027/events" }).reply(200, "<html>hi</html>");
      await expect(mlh.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
      agent
        .get(ORIGIN)
        .intercept({ path: "/seasons/2027/events" })
        .reply(200, page({ props: { events: [] } }));
      await expect(mlh.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
