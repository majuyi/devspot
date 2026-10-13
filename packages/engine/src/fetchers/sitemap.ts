import type { FetchResult, RawItemInput } from "@devspot/schema";
import { load } from "cheerio";
import type { FetchSource } from "../fetch.js";
import { type HttpClient, HttpStatusError, RobotsDisallowed } from "../http.js";
import { globToRegExp } from "./glob.js";
import { readablePage } from "./readable.js";
import { absoluteHttpUrl, isoDate } from "./util.js";

/** New pages fetched per run. The rest wait for the next run, newest first (docs/09). */
export const SITEMAP_PAGE_LIMIT = 20;
/** Child sitemaps read from one index; an index bigger than this needs a narrower source URL. */
export const SITEMAP_CHILD_LIMIT = 10;

const TITLE_MAX = 300;

/** The body was neither a `<urlset>` nor a `<sitemapindex>`. */
export class SitemapParseError extends Error {
  override readonly name = "SitemapParseError";
  constructor(readonly url: string) {
    super(`${url} is not a sitemap (no <urlset> or <sitemapindex>)`);
  }
}

/** A sitemap source has no `include` glob; the registry schema should have refused it. */
export class SitemapIncludeMissing extends Error {
  override readonly name = "SitemapIncludeMissing";
  constructor(readonly sourceKey: string) {
    super(`sitemap source ${sourceKey} has no include glob`);
  }
}

type Listed = { url: string; lastmod?: string };

/**
 * Stage 1 for `kind: sitemap` (docs/04 §1). Reads the sitemap (or each child of an index),
 * keeps URLs matching `include` that are not in `knownUrls`, and fetches the newest
 * SITEMAP_PAGE_LIMIT of them as readable text. A page that 4xx/5xxs or that robots.txt
 * disallows is skipped and named in `error`; the others still count.
 */
export async function fetchSitemap(source: FetchSource, http: HttpClient): Promise<FetchResult> {
  if (!source.include) throw new SitemapIncludeMissing(source.key);
  const include = globToRegExp(source.include);
  const known = source.knownUrls ?? new Set<string>();

  const listed = await listUrls(source.url, http);
  const fresh = dedupeByUrl(listed)
    .filter((l) => include.test(l.url) && !known.has(l.url))
    .sort(newestFirst)
    .slice(0, SITEMAP_PAGE_LIMIT);

  const items: RawItemInput[] = [];
  const skipped: string[] = [];
  for (const page of fresh) {
    try {
      items.push(...(await fetchPage(page, http)));
    } catch (e) {
      if (!(e instanceof HttpStatusError || e instanceof RobotsDisallowed)) throw e;
      skipped.push(
        e instanceof HttpStatusError
          ? `${page.url} (HTTP ${e.status})`
          : `${page.url} (robots.txt)`,
      );
    }
  }
  return {
    items,
    ...(skipped.length
      ? { error: `skipped ${skipped.length} page(s): ${skipped.join(", ")}` }
      : {}),
  };
}

async function listUrls(url: string, http: HttpClient): Promise<Listed[]> {
  const doc = parseSitemap(await http.text(url), url);
  if (doc.kind === "urlset") return doc.entries;
  const children = doc.entries.slice(0, SITEMAP_CHILD_LIMIT);
  const lists: Listed[][] = [];
  for (const child of children) {
    const nested = parseSitemap(await http.text(child.url), child.url);
    // One level of index only, as the sitemaps.org protocol allows.
    if (nested.kind === "urlset") lists.push(nested.entries);
  }
  return lists.flat();
}

function parseSitemap(body: string, url: string): { kind: "urlset" | "index"; entries: Listed[] } {
  const $ = load(body, { xml: true });
  const read = (selector: string): Listed[] =>
    $(selector)
      .toArray()
      .flatMap((el) => {
        const loc = $(el).children("loc").first().text().trim();
        const lastmod = $(el).children("lastmod").first().text().trim();
        const abs = absoluteHttpUrl(loc, url);
        return abs ? [{ url: abs, ...(lastmod ? { lastmod } : {}) }] : [];
      });
  if ($("urlset").length) return { kind: "urlset", entries: read("urlset > url") };
  if ($("sitemapindex").length) return { kind: "index", entries: read("sitemapindex > sitemap") };
  throw new SitemapParseError(url);
}

async function fetchPage(page: Listed, http: HttpClient): Promise<RawItemInput[]> {
  const html = await http.text(page.url, { accept: "text/html,application/xhtml+xml" });
  const readable = readablePage(html, page.url);
  const title = readable.title?.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  const text = readable.text || title;
  if (!text) return [];
  const publishedAt = isoDate(readable.publishedTime);
  const meta = {
    ...(readable.links.length ? { links: readable.links } : {}),
    ...(page.lastmod ? { lastmod: page.lastmod } : {}),
  };
  return [
    {
      url: page.url,
      ...(title ? { title } : {}),
      text,
      ...(publishedAt ? { publishedAt } : {}),
      ...(Object.keys(meta).length ? { meta } : {}),
    },
  ];
}

function dedupeByUrl(listed: Listed[]): Listed[] {
  const seen = new Set<string>();
  return listed.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

/** Newest `lastmod` first; entries without one go last, in sitemap order. */
function newestFirst(a: Listed, b: Listed): number {
  const ta = a.lastmod ? Date.parse(a.lastmod) : Number.NaN;
  const tb = b.lastmod ? Date.parse(b.lastmod) : Number.NaN;
  if (Number.isNaN(ta)) return Number.isNaN(tb) ? 0 : 1;
  if (Number.isNaN(tb)) return -1;
  return tb - ta;
}
