import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FetchSource } from "../src/fetch.js";
import { globToRegExp } from "../src/fetchers/glob.js";
import { readablePage } from "../src/fetchers/readable.js";
import {
  fetchSitemap,
  SITEMAP_PAGE_LIMIT,
  SitemapIncludeMissing,
  SitemapParseError,
} from "../src/fetchers/sitemap.js";
import { HttpClient } from "../src/http.js";

const ORIGIN = "https://example.org";
const source: FetchSource = {
  key: "example/programmes",
  organizationSlug: "example",
  kind: "sitemap",
  url: `${ORIGIN}/sitemap.xml`,
  include: `${ORIGIN}/programme/*/`,
};

let agent: MockAgent;

beforeEach(() => {
  agent = new MockAgent();
  agent.disableNetConnect();
});

afterEach(async () => {
  agent.assertNoPendingInterceptors();
  await agent.close();
});

const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });

function robots(body = "User-agent: *\nAllow: /\n"): void {
  agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(200, body);
}

function urlset(entries: Array<[string, string?]>): string {
  const urls = entries
    .map(
      ([loc, lastmod]) =>
        `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`,
    )
    .join("");
  return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function page(title: string, body: string): string {
  return `<html><head><title>${title}</title></head><body>
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <article><h1>${title}</h1>${body}</article>
    <footer>© Example. <a href="/privacy">Privacy</a></footer></body></html>`;
}

const article = (p: string) =>
  `<p>${p} This programme supports early-career developers with mentoring, a stipend and a cohort of peers across the region.</p><p>Applications close on 31 October 2026. <a href="/apply">Apply now</a></p>`;

describe("globToRegExp", () => {
  it("keeps * within a path segment and lets ** cross segments", () => {
    expect(globToRegExp("https://e.org/fellowship/*/").test("https://e.org/fellowship/lse/")).toBe(
      true,
    );
    expect(globToRegExp("https://e.org/fellowship/*/").test("https://e.org/fellowship/a/b/")).toBe(
      false,
    );
    expect(globToRegExp("https://e.org/**").test("https://e.org/a/b/c")).toBe(true);
  });

  it("treats dots and question marks literally enough for URLs", () => {
    expect(globToRegExp("https://e.org/jobs/*").test("https://eXorg/jobs/1")).toBe(false);
    expect(globToRegExp("https://e.org/p?").test("https://e.org/p1")).toBe(true);
  });
});

describe("fetchSitemap", () => {
  it("fetches matching URLs as readable text, newest lastmod first, skipping known ones", async () => {
    robots();
    const pool = agent.get(ORIGIN);
    pool.intercept({ path: "/sitemap.xml" }).reply(
      200,
      urlset([
        [`${ORIGIN}/programme/old/`, "2025-01-01T00:00:00Z"],
        [`${ORIGIN}/about/`, "2026-10-10T00:00:00Z"],
        [`${ORIGIN}/programme/new/`, "2026-10-01T00:00:00+01:00"],
        [`${ORIGIN}/programme/known/`, "2026-10-05T00:00:00Z"],
      ]),
    );
    pool.intercept({ path: "/programme/new/" }).reply(200, page("New Fellowship", article("New.")));
    pool.intercept({ path: "/programme/old/" }).reply(200, page("Old Fellowship", article("Old.")));
    const result = await fetchSitemap(
      { ...source, knownUrls: new Set([`${ORIGIN}/programme/known/`]) },
      http(),
    );
    expect(result.error).toBeUndefined();
    expect(result.items.map((i) => i.url)).toEqual([
      `${ORIGIN}/programme/new/`,
      `${ORIGIN}/programme/old/`,
    ]);
    const [first] = result.items;
    expect(first?.title).toBe("New Fellowship");
    expect(first?.text).toContain("Applications close on 31 October 2026.");
    expect(first?.text).not.toContain("Privacy");
    expect(first?.text).not.toContain("Home");
    expect(first?.meta).toEqual({
      links: [{ text: "Apply now", href: `${ORIGIN}/apply` }],
      lastmod: "2026-10-01T00:00:00+01:00",
    });
  });

  it("follows a sitemap index one level down", async () => {
    robots();
    const pool = agent.get(ORIGIN);
    pool
      .intercept({ path: "/sitemap.xml" })
      .reply(
        200,
        `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${ORIGIN}/posts.xml</loc></sitemap><sitemap><loc>${ORIGIN}/programmes.xml</loc></sitemap></sitemapindex>`,
      );
    pool.intercept({ path: "/posts.xml" }).reply(200, urlset([[`${ORIGIN}/news/1/`]]));
    pool.intercept({ path: "/programmes.xml" }).reply(200, urlset([[`${ORIGIN}/programme/a/`]]));
    pool.intercept({ path: "/programme/a/" }).reply(200, page("A", article("A.")));
    const result = await fetchSitemap(source, http());
    expect(result.items.map((i) => i.url)).toEqual([`${ORIGIN}/programme/a/`]);
  });

  it(`fetches at most ${SITEMAP_PAGE_LIMIT} pages in one run`, async () => {
    robots();
    const pool = agent.get(ORIGIN);
    const entries: Array<[string, string]> = Array.from(
      { length: SITEMAP_PAGE_LIMIT + 5 },
      (_, i) => [`${ORIGIN}/programme/p${i}/`, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()],
    );
    pool.intercept({ path: "/sitemap.xml" }).reply(200, urlset(entries));
    pool
      .intercept({ path: (p) => p.startsWith("/programme/") })
      .reply(200, page("P", article("P.")))
      .times(SITEMAP_PAGE_LIMIT);
    const result = await fetchSitemap(source, http());
    expect(result.items).toHaveLength(SITEMAP_PAGE_LIMIT);
    // Newest first: p24 down to p5; p0 to p4 wait for the next run.
    expect(result.items[0]?.url).toBe(`${ORIGIN}/programme/p${SITEMAP_PAGE_LIMIT + 4}/`);
    expect(result.items.map((i) => i.url)).not.toContain(`${ORIGIN}/programme/p4/`);
  });

  it("skips a page that 404s or that robots.txt disallows, and says so in error", async () => {
    robots("User-agent: *\nDisallow: /programme/private/\n");
    const pool = agent.get(ORIGIN);
    pool
      .intercept({ path: "/sitemap.xml" })
      .reply(
        200,
        urlset([
          [`${ORIGIN}/programme/gone/`],
          [`${ORIGIN}/programme/private/`],
          [`${ORIGIN}/programme/ok/`],
        ]),
      );
    pool.intercept({ path: "/programme/gone/" }).reply(404, "missing");
    pool.intercept({ path: "/programme/ok/" }).reply(200, page("OK", article("OK.")));
    const result = await fetchSitemap(source, http());
    expect(result.items.map((i) => i.url)).toEqual([`${ORIGIN}/programme/ok/`]);
    expect(result.error).toBe(
      `skipped 2 page(s): ${ORIGIN}/programme/gone/ (HTTP 404), ${ORIGIN}/programme/private/ (robots.txt)`,
    );
  });

  it("throws SitemapParseError when the body is not a sitemap", async () => {
    robots();
    agent
      .get(ORIGIN)
      .intercept({ path: "/sitemap.xml" })
      .reply(200, "<html><body>Not here</body></html>");
    await expect(fetchSitemap(source, http())).rejects.toBeInstanceOf(SitemapParseError);
  });

  it("throws SitemapIncludeMissing without an include glob", async () => {
    const { include: _, ...noInclude } = source;
    await expect(fetchSitemap(noInclude, http())).rejects.toBeInstanceOf(SitemapIncludeMissing);
  });
});

describe("readablePage", () => {
  it("drops nav and footer even on a page too short to look like an article", () => {
    const result = readablePage(
      "<html><head><title>Short</title></head><body><nav>Menu</nav><p>Deadline: 1 Nov.</p><footer>Foot</footer></body></html>",
      ORIGIN,
    );
    expect(result.title).toBe("Short");
    expect(result.text).toBe("Deadline: 1 Nov.");
  });
});
