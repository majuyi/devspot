import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import adapter from "../../src/adapters/google-accelerator.js";
import { extractRules } from "../../src/extract/rules.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { isOver } from "../../src/over.js";
import { findSource } from "../../src/registry.js";

const ORIGIN = "https://startup.google.com";
const PATH = "/programs/accelerator/africa/";
const source = findSource("google-for-startups/accelerator-africa");

const extract = (title: string, text: string, now: string) =>
  extractRules({
    item: { title, text, canonicalUrl: `${ORIGIN}${PATH}`, publishedAt: null, meta: undefined },
    org: { category: "accelerator", country: "US" },
    now: new Date(now),
  });

describe("google-accelerator adapter", () => {
  it("replays the round as one item dated from the calendar links", async () => {
    const { actual } = await replaySource({ source, fetch: fetchSource });
    expect(actual.items).toHaveLength(1);
    const [item] = actual.items;
    expect(item?.title).toBe("Google for Startups Accelerator: Africa");
    expect(item?.text).toContain(
      "Location: Hybrid\nApplications open: 4 February 2026\nDeadline: 18 March 2026",
    );
    expect(item?.text).toContain("a mix of remote and in-person");
    // The alumni list names countries; none of it is kept.
    expect(item?.text).not.toMatch(/Nigeria|Kenya/);

    const { draft } = extract(item?.title ?? "", item?.text ?? "", "2026-02-10T00:00:00Z");
    expect(draft).toMatchObject({
      kind: "accelerator",
      deadlineKind: "fixed",
      locationMode: "hybrid",
    });
    expect(draft.deadlineAt?.slice(0, 10)).toBe("2026-03-18");
    expect(draft.country).toBeUndefined();
    // Today the 2026 round is over, so the loader stores it closed until the next is posted.
    const at = (s?: string) => (s ? new Date(s) : null);
    expect(
      isOver(
        {
          kind: draft.kind ?? null,
          deadlineAt: at(draft.deadlineAt),
          startsAt: at(draft.startsAt),
          endsAt: at(draft.endsAt),
        },
        new Date("2026-11-27T12:00:00Z"),
      ),
    ).toBe(true);
  });

  describe("against a stub", () => {
    let agent: MockAgent;
    beforeEach(() => {
      agent = new MockAgent();
      agent.disableNetConnect();
      agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(404, "");
    });
    afterEach(() => agent.close());
    const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });
    const page = (body: string) =>
      agent
        .get(ORIGIN)
        .intercept({ path: PATH })
        .reply(200, `<html><head>${body}`, { headers: { "content-type": "text/html" } });
    const fetch = () => adapter.fetch({ ...source, url: `${ORIGIN}${PATH}` }, http());

    it("states no date between rounds", async () => {
      page('<meta property="og:title" content="Google for Startups Accelerator: Africa"></head>');
      const [item] = await fetch();
      expect(item?.text).toBe("Host: Google for Startups");
    });

    it("keeps other steps of the timeline under their own names", async () => {
      const link = (step: string, dates: string) =>
        `<a href="https://www.google.com/calendar/event?action=TEMPLATE&amp;text=Accelerator: Africa ${step}&amp;dates=${dates}">Add</a>`;
      page(
        `<title>Accelerator: Africa</title></head><body>${link("Applications Close", "20270310/20270310")}${link("Program Starts", "20270420T090000Z/20270420T100000Z")}${link("Applications Close", "20270310/20270310")}</body>`,
      );
      const [item] = await fetch();
      expect(item?.text).toBe(
        "Host: Google for Startups\nDeadline: 10 March 2027\nProgram Starts: 20 April 2027",
      );
    });

    it("throws when the page has no title", async () => {
      page("</head><body></body>");
      await expect(fetch()).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
