import type { FetchResult, RawItemInput, Validators } from "@devspot/schema";
import { parseFeed } from "feedsmith";
import type { FetchSource } from "../fetch.js";
import { type HttpClient, HttpStatusError } from "../http.js";
import { htmlToText, type TextLink } from "./html-text.js";
import { absoluteHttpUrl, isoDate } from "./util.js";

/** The body was not RSS, Atom, RDF or JSON Feed, or feedsmith could not read it. */
export class FeedParseError extends Error {
  override readonly name = "FeedParseError";
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`could not parse the feed at ${url}: ${reason}`);
  }
}

/** One entry before HTML stripping, whatever the feed format. */
type Entry = {
  link?: string;
  title?: string;
  html?: string;
  plain?: string;
  date?: string;
  categories: string[];
};

const TITLE_MAX = 300;

/** WordPress appends this to every feed entry; its links would mislead the applyUrl rule. */
const WORDPRESS_TRAILER =
  /<p>\s*The post\s+<a\b[^>]*>[\s\S]*?<\/a>\s+appeared first on\s+<a\b[^>]*>[\s\S]*?<\/a>\.?\s*<\/p>\s*$/i;

/**
 * Stage 1 for `kind: feed` (docs/04 §1). Sends the stored validators as a conditional GET;
 * a 304 returns no items and the same validators. Each entry becomes one RawItemInput whose
 * text is the entry's content (or summary) with HTML stripped; links go in `meta.links`.
 */
export async function fetchFeed(source: FetchSource, http: HttpClient): Promise<FetchResult> {
  const headers: Record<string, string> = {
    accept:
      "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, */*;q=0.8",
  };
  if (source.validators?.etag) headers["if-none-match"] = source.validators.etag;
  if (source.validators?.lastModified)
    headers["if-modified-since"] = source.validators.lastModified;

  const res = await http.get(source.url, headers);
  if (res.status === 304) {
    return {
      items: [],
      httpStatus: 304,
      ...(source.validators ? { validators: source.validators } : {}),
    };
  }
  if (res.status < 200 || res.status >= 300) throw new HttpStatusError(res.url, res.status);

  const validators: Validators = {
    ...(res.headers.etag ? { etag: res.headers.etag } : {}),
    ...(res.headers["last-modified"] ? { lastModified: res.headers["last-modified"] } : {}),
  };
  const items = readEntries(res.body, res.url).flatMap((e) => toRawItem(e, res.url));
  return {
    items,
    httpStatus: res.status,
    ...(Object.keys(validators).length ? { validators } : {}),
  };
}

function readEntries(body: string, url: string): Entry[] {
  let parsed: ReturnType<typeof parseFeed>;
  try {
    parsed = parseFeed(body);
  } catch (e) {
    throw new FeedParseError(url, e instanceof Error ? e.message : String(e));
  }
  switch (parsed.format) {
    case "rss":
      return (parsed.feed.items ?? []).map((i) => ({
        link: i.link ?? permalinkGuid(i.guid),
        title: i.title,
        html: i.content?.encoded ?? i.description,
        date: i.pubDate ?? i.dc?.dates?.[0],
        categories: (i.categories ?? []).flatMap((c) => (c.name ? [c.name] : [])),
      }));
    case "atom":
      return (parsed.feed.entries ?? []).map((e) => ({
        link: (e.links ?? []).find((l) => !l.rel || l.rel === "alternate")?.href ?? e.id,
        title: e.title,
        html: e.content ?? e.summary,
        date: e.published ?? e.updated,
        categories: (e.categories ?? []).flatMap((c) => (c.term ? [c.term] : [])),
      }));
    case "rdf":
      return (parsed.feed.items ?? []).map((i) => ({
        link: i.link,
        title: i.title,
        html: i.content?.encoded ?? i.description,
        date: i.dc?.dates?.[0],
        categories: [],
      }));
    case "json":
      return (parsed.feed.items ?? []).map((i) => ({
        link: i.url ?? i.external_url,
        title: i.title,
        html: i.content_html ?? i.summary,
        plain: i.content_text,
        date: i.date_published,
        categories: i.tags ?? [],
      }));
  }
}

/** Entries without a usable http(s) link or any text are dropped: nothing to point a reader at. */
function toRawItem(entry: Entry, feedUrl: string): RawItemInput[] {
  const url = absoluteHttpUrl(entry.link, feedUrl);
  if (!url) return [];
  const title = entry.title ? oneLine(htmlToText(entry.title).text).slice(0, TITLE_MAX) : undefined;
  const body = entry.html
    ? htmlToText(entry.html.replace(WORDPRESS_TRAILER, ""), url)
    : { text: entry.plain?.trim() ?? "", links: [] };
  const text = body.text || title;
  if (!text) return [];
  const publishedAt = isoDate(entry.date);
  const meta: { links?: TextLink[]; categories?: string[] } = {
    ...(body.links.length ? { links: body.links } : {}),
    ...(entry.categories.length ? { categories: entry.categories } : {}),
  };
  return [
    {
      url,
      ...(title ? { title } : {}),
      text,
      ...(publishedAt ? { publishedAt } : {}),
      ...(Object.keys(meta).length ? { meta } : {}),
    },
  ];
}

/** A guid stands in for the link only when it is itself an absolute URL. */
function permalinkGuid(guid: { value?: string; isPermaLink?: boolean } | undefined) {
  return guid?.isPermaLink !== false && guid?.value && /^https?:\/\//i.test(guid.value)
    ? guid.value
    : undefined;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
