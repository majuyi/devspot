import type { RawItemInput } from "@devspot/schema";
import { load } from "cheerio";
import { z } from "zod";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { canonicalizeUrl } from "../dedupe.js";
import { htmlToText } from "../fetchers/html-text.js";
import { itemMatcher } from "../filter.js";
import { HttpStatusError, RobotsDisallowed } from "../http.js";

/** Role details fetched per run. The rest wait for the next run, in listing order. */
export const GREENHOUSE_DETAIL_LIMIT = 15;

const Job = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  absolute_url: z.string(),
  location: z.object({ name: z.string().nullish() }).nullish(),
  first_published: z.string().nullish(),
  application_deadline: z.string().nullish(),
});
type Job = z.infer<typeof Job>;

const Listing = z.object({ jobs: z.array(Job) });

const Detail = Job.extend({
  content: z.string().nullish(),
  departments: z.array(z.object({ name: z.string() })).nullish(),
});
type Detail = z.infer<typeof Detail>;

/**
 * Any Greenhouse job board. The registry `url` is the public board API,
 * `https://boards-api.greenhouse.io/v1/boards/<board>/jobs`: titles and locations, but no
 * descriptions (asking for them with `content=true` makes a large board most of a megabyte).
 * Each new role then costs one request for `/jobs/<id>`. Like the workable adapter it returns
 * only roles not in `knownUrls`, at most GREENHOUSE_DETAIL_LIMIT per run, and asks the
 * source's filter first (title and country; the department is known only after detail) so
 * dropped roles do not use the cap. It also reports every role the list holds, so one that
 * has left the board can be closed.
 */
const adapter = {
  key: "greenhouse",
  async fetch(source, http) {
    const listUrl = new URL(source.url);
    if (!/^\/v1\/boards\/[^/]+\/jobs\/?$/.test(listUrl.pathname))
      throw new AdapterLayoutChanged(
        "greenhouse",
        source.url,
        "url is not /v1/boards/<board>/jobs",
      );
    const parsed = Listing.safeParse(await http.json(source.url));
    if (!parsed.success)
      throw new AdapterLayoutChanged(
        "greenhouse",
        source.url,
        parsed.error.issues[0]?.message ?? "",
      );
    const known = source.knownUrls ?? new Set<string>();
    const keep = itemMatcher(source.filter);
    const listed = parsed.data.jobs.map((job) => job.absolute_url);
    const fresh = parsed.data.jobs
      .filter((job) => !known.has(canonicalizeUrl(job.absolute_url)))
      .filter((job) => keep({ title: job.title, country: countryOf(job) }))
      .slice(0, GREENHOUSE_DETAIL_LIMIT);

    const items: RawItemInput[] = [];
    const base = listUrl.href.replace(/\/$/, "");
    for (const job of fresh) {
      const detailUrl = `${base}/${encodeURIComponent(job.id)}`;
      let body: unknown;
      try {
        body = await http.json(detailUrl);
      } catch (e) {
        // A role closed since the list was read stays unknown and is tried again next run.
        if (e instanceof HttpStatusError || e instanceof RobotsDisallowed) continue;
        throw e;
      }
      const detail = Detail.safeParse(body);
      if (!detail.success)
        throw new AdapterLayoutChanged(
          "greenhouse",
          detailUrl,
          detail.error.issues[0]?.message ?? "",
        );
      items.push(toItem(detail.data));
    }
    return { items, listed };
  },
} satisfies Adapter;

const text = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() || undefined;

/** English country names to ISO alpha-2, from the runtime's own region names. */
const COUNTRY_CODES: ReadonlyMap<string, string> = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const map = new Map<string, string>();
  const A = "A".charCodeAt(0);
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      const name = names.of(code);
      if (name && name !== code) map.set(name.toLowerCase(), code);
    }
  return map;
})();

/** The country a board writes last ("Remote, Lagos, Nigeria"), when it names one. */
function countryOf(job: Job): string | undefined {
  const last = text(job.location?.name)?.split(",").pop()?.trim().toLowerCase();
  return last ? COUNTRY_CODES.get(last) : undefined;
}

/** Greenhouse dates are ISO; the deadline is a calendar day, as the board states it. */
const DAY = /^(\d{4})-(\d{2})-(\d{2})/;
function dayLine(iso: string | null | undefined): string | undefined {
  const m = iso?.match(DAY);
  if (!m) return undefined;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return at.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function toItem(d: Detail): RawItemInput {
  const title = text(d.title) ?? d.title;
  const department = text(d.departments?.[0]?.name);
  const location = text(d.location?.name);
  const country = countryOf(d);
  const deadline = dayLine(d.application_deadline);
  const facts = [
    department && `Department: ${department}`,
    location && `Location: ${location}`,
    deadline && `Deadline: ${deadline}`,
  ].filter(Boolean);
  // The board API escapes the description's HTML once more: unescape, then read it.
  const html = load(d.content ?? "").text();
  const body = [facts.join("\n"), htmlToText(html, d.absolute_url).text]
    .filter(Boolean)
    .join("\n\n");
  const posted = d.first_published?.match(DAY)?.[0];
  const meta = {
    ...(department ? { department } : {}),
    ...(country ? { country } : {}),
  };
  return {
    url: d.absolute_url,
    title: title.slice(0, 300),
    text: body || title,
    ...(posted ? { publishedAt: `${posted}T00:00:00.000Z` } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

export default adapter;
