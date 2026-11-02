import type { RawItemInput } from "@devspot/schema";
import { z } from "zod";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { canonicalizeUrl } from "../dedupe.js";
import { htmlToText } from "../fetchers/html-text.js";
import { itemMatcher } from "../filter.js";
import { HttpStatusError, RobotsDisallowed } from "../http.js";

/** Role details fetched per run. The rest wait for the next run, in listing order. */
export const WORKABLE_DETAIL_LIMIT = 15;

const Place = z.object({
  city: z.string().nullish(),
  region: z.string().nullish(),
  country: z.string().nullish(),
  countryCode: z.string().nullish(),
});

const Listing = z.object({
  jobs: z.array(
    z.object({
      title: z.string(),
      shortcode: z.string(),
      url: z.string(),
      department: z.string().nullish(),
      employment_type: z.string().nullish(),
      experience: z.string().nullish(),
      telecommuting: z.boolean().nullish(),
      published_on: z.string().nullish(),
      locations: z.array(Place).nullish(),
    }),
  ),
});
type Listed = z.infer<typeof Listing>["jobs"][number];

const Detail = z.object({
  title: z.string(),
  description: z.string().nullish(),
  requirements: z.string().nullish(),
  benefits: z.string().nullish(),
  workplace: z.string().nullish(),
  location: Place.nullish(),
});
type Detail = z.infer<typeof Detail>;

/**
 * Any Workable careers board. The registry `url` is the public widget list,
 * `https://apply.workable.com/api/v1/widget/accounts/<company>`: titles, departments,
 * countries and levels, but no descriptions (asking for them makes a large board several
 * hundred kilobytes). Each new role then costs one request for
 * `/api/v2/accounts/<company>/jobs/<shortcode>`. Like the bamboohr adapter it returns only
 * roles not in `knownUrls`, at most WORKABLE_DETAIL_LIMIT per run, and asks the source's
 * filter first so dropped roles do not use the cap.
 */
const adapter: Adapter = {
  key: "workable",
  async fetch(source, http) {
    const company = new URL(source.url).pathname.match(/\/accounts\/([^/]+)\/?$/)?.[1];
    if (!company)
      throw new AdapterLayoutChanged("workable", source.url, "url names no /accounts/<company>");
    const parsed = Listing.safeParse(await http.json(source.url));
    if (!parsed.success)
      throw new AdapterLayoutChanged("workable", source.url, parsed.error.issues[0]?.message ?? "");
    const known = source.knownUrls ?? new Set<string>();
    const keep = itemMatcher(source.filter);
    const fresh = parsed.data.jobs
      .filter((job) => !known.has(canonicalizeUrl(job.url)))
      .filter((job) => keep(listedFields(job)))
      .slice(0, WORKABLE_DETAIL_LIMIT);

    const items: RawItemInput[] = [];
    for (const job of fresh) {
      const detailUrl = `https://apply.workable.com/api/v2/accounts/${company}/jobs/${encodeURIComponent(job.shortcode)}`;
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
          "workable",
          detailUrl,
          detail.error.issues[0]?.message ?? "",
        );
      items.push(toItem(job, detail.data));
    }
    return items;
  },
};

const text = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() || undefined;

function listedFields(job: Listed) {
  return {
    title: job.title,
    department: text(job.department),
    country: text(job.locations?.[0]?.countryCode)?.toUpperCase(),
    level: text(job.experience),
  };
}

const WORKPLACE: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  on_site: "On-site",
};

function toItem(job: Listed, d: Detail): RawItemInput {
  const listed = listedFields(job);
  const place = d.location ?? job.locations?.[0];
  const where = [...new Set([place?.city, place?.region, place?.country].map(text))]
    .filter(Boolean)
    .join(", ");
  const mode = WORKPLACE[d.workplace ?? ""] ?? (job.telecommuting ? "Remote" : undefined);
  const location =
    mode === "Remote" || mode === "Hybrid" ? `${mode}${where ? ` (${where})` : ""}` : where;
  const title = text(d.title) ?? job.title;
  const facts = [
    listed.department && `Department: ${listed.department}`,
    text(job.employment_type) && `Employment: ${text(job.employment_type)}`,
    listed.level && `Level: ${listed.level}`,
    location && `Location: ${location}`,
  ].filter(Boolean);
  const sections = [
    htmlToText(d.description ?? "", job.url).text,
    d.requirements && `Requirements\n\n${htmlToText(d.requirements, job.url).text}`,
    d.benefits && `Benefits\n\n${htmlToText(d.benefits, job.url).text}`,
  ];
  const body = [facts.join("\n"), ...sections].filter(Boolean).join("\n\n") || title;
  const posted =
    job.published_on && /^\d{4}-\d{2}-\d{2}$/.test(job.published_on) ? job.published_on : null;
  const meta = {
    ...(listed.department ? { department: listed.department } : {}),
    ...(listed.country ? { country: listed.country } : {}),
    ...(listed.level ? { level: listed.level } : {}),
  };
  return {
    url: job.url,
    title: title.slice(0, 300),
    text: body,
    ...(posted ? { publishedAt: `${posted}T00:00:00.000Z` } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

export default adapter;
