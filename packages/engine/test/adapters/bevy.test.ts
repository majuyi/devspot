import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import bevy from "../../src/adapters/bevy.js";
import { canonicalizeUrl } from "../../src/dedupe.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const ORIGIN = "https://gdg.community.dev";
const source = findSource("gdg-ibadan/events");
const page = (data: unknown) =>
  `<html><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script></body></html>`;

describe("bevy adapter", () => {
  it("replays GDG Ibadan to its upcoming events, each with a date and a venue", async () => {
    const { actual } = await replaySource({ source, fetch: fetchSource });
    expect(actual.items.length).toBeGreaterThan(0);
    for (const item of actual.items) {
      expect(item.url).toMatch(/^https:\/\/gdg\.community\.dev\/events\/details\/.+\/$/);
      expect(item.text).toMatch(/^Date: \d{1,2} \w+ 20\d\d, \d\d:\d\d UTC$/m);
      expect(item.text).toMatch(/^Location: .*Ibadan/m);
    }
  });

  describe("against stub pages", () => {
    let agent: MockAgent;
    let requested: string[];
    beforeEach(() => {
      agent = new MockAgent();
      agent.disableNetConnect();
      requested = [];
      agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(404, "").persist();
    });
    afterEach(async () => {
      await agent.close();
    });
    const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });
    const chapter = (slugs: string[]) =>
      agent
        .get(ORIGIN)
        .intercept({ path: "/gdg-ibadan/" })
        .reply(
          200,
          page({
            props: {
              pageProps: {
                prerenderData: {
                  upcomingEvents: {
                    results: slugs.map((s) => ({
                      title: s,
                      url: `${ORIGIN}/events/details/${s}/`,
                      start_date: "2026-11-21T06:00:00Z",
                    })),
                  },
                },
              },
            },
          }),
        );
    const event = (slug: string, data: Record<string, unknown> = {}, status = 200) =>
      agent
        .get(ORIGIN)
        .intercept({ path: `/events/details/${slug}/` })
        .reply(() => {
          requested.push(slug);
          return {
            statusCode: status,
            data: page({
              props: {
                pageProps: {
                  eventData: {
                    title: `DevFest  ${slug}`,
                    description: "<p>Talks and workshops.</p>",
                    start_date: "2026-11-21T08:00:00Z",
                    end_date: "2026-11-21T16:00:00Z",
                    is_virtual_event: false,
                    event_type_title: "Free registration",
                    venue_name: "Kakanfo Inn",
                    venue_address: "Ring Road",
                    venue_city: "Ibadan",
                    ...data,
                  },
                },
              },
            }),
          };
        });

    it("builds an item from the event's own page", async () => {
      chapter(["devfest"]);
      event("devfest");
      expect(await bevy.fetch(source, http())).toEqual([
        {
          url: `${ORIGIN}/events/details/devfest/`,
          title: "DevFest devfest",
          text: "Date: 21 November 2026, 08:00 UTC\nEnds: 21 November 2026, 16:00 UTC\nLocation: Kakanfo Inn, Ring Road, Ibadan\nRegistration: Free registration\n\nTalks and workshops.",
        },
      ]);
    });

    it("trusts a stated venue over Bevy's virtual flag, and says online only without one", async () => {
      chapter(["flagged", "online"]);
      event("flagged", { is_virtual_event: true, event_type_title: "External registration" });
      event("online", {
        is_virtual_event: true,
        venue_name: null,
        venue_address: null,
        venue_city: null,
      });
      const [flagged, online] = await bevy.fetch(source, http());
      expect(flagged?.text).toContain("Location: Kakanfo Inn, Ring Road, Ibadan\n");
      expect(online?.text).toContain("Location: Online\n");
    });

    it("does not repeat a city the address already names", async () => {
      chapter(["named"]);
      event("named", { venue_address: "7B Oba Olagbegi, Bodija, Ibadan, Nigeria." });
      const [item] = await bevy.fetch(source, http());
      expect(item?.text).toContain(
        "Location: Kakanfo Inn, 7B Oba Olagbegi, Bodija, Ibadan, Nigeria.\n",
      );
    });

    it("skips known events and leaves a withdrawn one for the next run", async () => {
      chapter(["known", "gone", "new"]);
      event("gone", {}, 404);
      event("new");
      const items = await bevy.fetch(
        // Known URLs come from RawItem.canonicalUrl, which drops the trailing slash.
        { ...source, knownUrls: new Set([canonicalizeUrl(`${ORIGIN}/events/details/known/`)]) },
        http(),
      );
      expect(requested).toEqual(["gone", "new"]);
      expect(items.map((i) => i.url)).toEqual([`${ORIGIN}/events/details/new/`]);
    });

    it("throws AdapterLayoutChanged without __NEXT_DATA__ or with a changed shape", async () => {
      agent.get(ORIGIN).intercept({ path: "/gdg-ibadan/" }).reply(200, "<html>hi</html>");
      await expect(bevy.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
      agent
        .get(ORIGIN)
        .intercept({ path: "/gdg-ibadan/" })
        .reply(200, page({ props: { pageProps: {} } }));
      await expect(bevy.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
      chapter(["odd"]);
      agent
        .get(ORIGIN)
        .intercept({ path: "/events/details/odd/" })
        .reply(200, page({ props: { pageProps: { eventData: { name: "x" } } } }));
      await expect(bevy.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
