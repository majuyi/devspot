import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchSource } from "../src/fetch.js";
import { FeedParseError, fetchFeed } from "../src/fetchers/feed.js";
import { HttpClient, HttpStatusError } from "../src/http.js";

const ORIGIN = "https://example.org";
const source: FetchSource = {
  key: "example/blog",
  organizationSlug: "example",
  kind: "feed",
  url: `${ORIGIN}/feed/`,
};

let agent: MockAgent;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
  agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(200, "User-agent: *\nAllow: /\n");
});

afterEach(async () => {
  agent.assertNoPendingInterceptors();
  await agent.close();
});

const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });

function rss(items: string): string {
  return `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Example</title><link>${ORIGIN}</link>${items}</channel></rss>`;
}

describe("conditional requests", () => {
  it("sends stored validators and returns no items on 304", async () => {
    const validators = { etag: '"abc"', lastModified: "Fri, 09 Oct 2026 10:35:04 GMT" };
    agent
      .get(ORIGIN)
      .intercept({
        path: "/feed/",
        headers: { "if-none-match": '"abc"', "if-modified-since": validators.lastModified },
      })
      .reply(304, "");
    expect(await fetchFeed({ ...source, validators }, http())).toEqual({
      items: [],
      httpStatus: 304,
      validators,
    });
  });

  it("returns the response's validators for next time", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/feed/" })
      .reply(200, rss(""), {
        headers: { etag: '"v2"', "last-modified": "Sat, 10 Oct 2026 09:00:00 GMT" },
      });
    const result = await fetchFeed(source, http());
    expect(result.httpStatus).toBe(200);
    expect(result.validators).toEqual({
      etag: '"v2"',
      lastModified: "Sat, 10 Oct 2026 09:00:00 GMT",
    });
  });

  it("sends no conditional headers on a first run and omits validators the server lacks", async () => {
    agent
      .get(ORIGIN)
      .intercept({
        path: "/feed/",
        headers: (h) => !("if-none-match" in h) && !("if-modified-since" in h),
      })
      .reply(200, rss(""));
    expect(await fetchFeed(source, http())).toEqual({ items: [], httpStatus: 200 });
  });
});

describe("errors", () => {
  it("throws HttpStatusError on a 404", async () => {
    agent.get(ORIGIN).intercept({ path: "/feed/" }).reply(404, "gone");
    await expect(fetchFeed(source, http())).rejects.toBeInstanceOf(HttpStatusError);
  });

  it("throws FeedParseError when the body is not a feed", async () => {
    agent.get(ORIGIN).intercept({ path: "/feed/" }).reply(200, "<html><body>Hello</body></html>");
    await expect(fetchFeed(source, http())).rejects.toBeInstanceOf(FeedParseError);
  });
});

describe("RSS", () => {
  it("maps an entry: content over description, RFC 822 date to ISO, categories, links", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/feed/" })
      .reply(
        200,
        rss(`<item><title>Call for Applications: Fellowship &#8211; 2027</title>
          <link>${ORIGIN}/fellowship</link>
          <pubDate>Wed, 30 Sep 2026 10:00:37 +0100</pubDate>
          <category><![CDATA[Opportunities]]></category>
          <description><![CDATA[<p>Short summary</p>]]></description>
          <content:encoded><![CDATA[<p>Applications close 31 October.</p><p><a href="/apply">Apply now</a></p>
          <p>The post <a href="${ORIGIN}/fellowship">Call for Applications</a> appeared first on <a href="${ORIGIN}">Example</a>.</p>]]></content:encoded></item>`),
      );
    const { items } = await fetchFeed(source, http());
    expect(items).toEqual([
      {
        url: `${ORIGIN}/fellowship`,
        title: "Call for Applications: Fellowship – 2027",
        text: "Applications close 31 October.\n\nApply now",
        publishedAt: "2026-09-30T09:00:37.000Z",
        meta: {
          links: [{ text: "Apply now", href: `${ORIGIN}/apply` }],
          categories: ["Opportunities"],
        },
      },
    ]);
  });

  it("uses a permalink guid when there is no link, and drops entries with no URL", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/feed/" })
      .reply(
        200,
        rss(`<item><title>Has guid</title><guid>${ORIGIN}/a</guid><description>x</description></item>
          <item><title>Opaque guid</title><guid isPermaLink="false">post-42</guid><description>y</description></item>
          <item><title>Relative guid</title><guid>post-43</guid><description>z</description></item>`),
      );
    const { items } = await fetchFeed(source, http());
    expect(items.map((i) => i.url)).toEqual([`${ORIGIN}/a`]);
  });

  it("resolves a relative link, falls back to the title for text, and drops a bad date", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/feed/" })
      .reply(
        200,
        rss(
          "<item><title>Title only</title><link>/b</link><pubDate>sometime soon</pubDate></item>",
        ),
      );
    const { items } = await fetchFeed(source, http());
    expect(items).toEqual([{ url: `${ORIGIN}/b`, title: "Title only", text: "Title only" }]);
  });
});

describe("other formats", () => {
  it("maps Atom: alternate link, published date, category terms", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/feed/" })
      .reply(
        200,
        `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>E</title><id>urn:e</id><updated>2026-10-01T00:00:00Z</updated>
        <entry><id>tag:e,2026:1</id><title>GSoC 2027 applications open</title>
          <link rel="self" href="${ORIGIN}/api/1"/><link rel="alternate" type="text/html" href="${ORIGIN}/2026/gsoc.html"/>
          <published>2026-04-30T11:30:00-07:00</published><updated>2026-05-01T00:00:00Z</updated>
          <category term="gsoc"/><content type="html">&lt;p&gt;Apply by 31 March.&lt;/p&gt;</content></entry></feed>`,
      );
    const { items } = await fetchFeed(source, http());
    expect(items).toEqual([
      {
        url: `${ORIGIN}/2026/gsoc.html`,
        title: "GSoC 2027 applications open",
        text: "Apply by 31 March.",
        publishedAt: "2026-04-30T18:30:00.000Z",
        meta: { categories: ["gsoc"] },
      },
    ]);
  });

  it("maps JSON Feed, preferring content_html and falling back to content_text", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/feed/" })
      .reply(
        200,
        JSON.stringify({
          version: "https://jsonfeed.org/version/1.1",
          title: "E",
          items: [
            {
              id: "1",
              url: `${ORIGIN}/1`,
              title: "One",
              content_html: "<p>Hello</p>",
              tags: ["grant"],
            },
            {
              id: "2",
              url: `${ORIGIN}/2`,
              content_text: "  Plain text  ",
              date_published: "2026-10-01T08:00:00+01:00",
            },
          ],
        }),
        { headers: { "content-type": "application/feed+json" } },
      );
    const { items } = await fetchFeed(source, http());
    expect(items).toEqual([
      { url: `${ORIGIN}/1`, title: "One", text: "Hello", meta: { categories: ["grant"] } },
      { url: `${ORIGIN}/2`, text: "Plain text", publishedAt: "2026-10-01T07:00:00.000Z" },
    ]);
  });

  it("maps RDF (RSS 1.0) with a Dublin Core date", async () => {
    agent
      .get(ORIGIN)
      .intercept({ path: "/feed/" })
      .reply(
        200,
        `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
        <channel rdf:about="${ORIGIN}"><title>E</title><link>${ORIGIN}</link></channel>
        <item rdf:about="${ORIGIN}/r"><title>Hackathon</title><link>${ORIGIN}/r</link><description>Join us</description><dc:date>2026-10-02T10:00:00Z</dc:date></item></rdf:RDF>`,
      );
    const { items } = await fetchFeed(source, http());
    expect(items).toEqual([
      {
        url: `${ORIGIN}/r`,
        title: "Hackathon",
        text: "Join us",
        publishedAt: "2026-10-02T10:00:00.000Z",
      },
    ]);
  });
});
