import type { RawItemInput } from "@devspot/schema";
import { z } from "zod";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { canonicalizeUrl } from "../dedupe.js";
import { htmlToText } from "../fetchers/html-text.js";
import { itemMatcher } from "../filter.js";
import { HttpStatusError, RobotsDisallowed } from "../http.js";

/** Role pages fetched per run. The rest wait for the next run, in listing order. */
export const BAMBOOHR_DETAIL_LIMIT = 15;

const Place = z
  .object({
    city: z.string().nullish(),
    state: z.string().nullish(),
    addressCountry: z.string().nullish(),
    country: z.string().nullish(),
  })
  .nullish();

const Listing = z.object({
  result: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).transform(String),
      jobOpeningName: z.string(),
      departmentLabel: z.string().nullish(),
    }),
  ),
});

const Detail = z.object({
  result: z.object({
    jobOpening: z.object({
      jobOpeningName: z.string(),
      departmentLabel: z.string().nullish(),
      employmentStatusLabel: z.string().nullish(),
      location: Place,
      atsLocation: Place,
      isRemote: z.boolean().nullish(),
      datePosted: z.string().nullish(),
      description: z.string().nullish(),
    }),
  }),
});
type Opening = z.infer<typeof Detail>["result"]["jobOpening"];

/**
 * Any BambooHR careers board: `https://<company>.bamboohr.com/careers/list` is the JSON
 * behind the company's careers page. The list has titles and departments only, so each new
 * role costs a request for `/careers/<id>/detail`. Like the devpost adapter it returns only
 * roles not in `knownUrls`, at most BAMBOOHR_DETAIL_LIMIT per run, and it asks the source's
 * filter first so roles the filter drops (never stored, so never known) do not use the cap.
 */
const adapter: Adapter = {
  key: "bamboohr",
  async fetch(source, http) {
    const parsed = Listing.safeParse(await http.json(source.url));
    if (!parsed.success)
      throw new AdapterLayoutChanged("bamboohr", source.url, parsed.error.issues[0]?.message ?? "");
    const origin = new URL(source.url).origin;
    const known = source.knownUrls ?? new Set<string>();
    const keep = itemMatcher(source.filter);
    const fresh = parsed.data.result
      .map((job) => ({ ...job, url: `${origin}/careers/${encodeURIComponent(job.id)}` }))
      .filter((job) => !known.has(canonicalizeUrl(job.url)))
      .filter((job) =>
        keep({ title: job.jobOpeningName, department: job.departmentLabel ?? undefined }),
      )
      .slice(0, BAMBOOHR_DETAIL_LIMIT);

    const items: RawItemInput[] = [];
    for (const job of fresh) {
      const detailUrl = `${job.url}/detail`;
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
          "bamboohr",
          detailUrl,
          detail.error.issues[0]?.message ?? "",
        );
      items.push(toItem(job.url, detail.data.result.jobOpening));
    }
    return items;
  },
};

function place(o: Opening): string {
  const p = o.location ?? o.atsLocation;
  const parts = [p?.city, p?.state, p?.addressCountry ?? p?.country]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  return [...new Set(parts)].join(", ");
}

function toItem(url: string, o: Opening): RawItemInput {
  const title = o.jobOpeningName.replace(/\s+/g, " ").trim();
  const where = place(o);
  const facts = [
    o.departmentLabel && `Department: ${o.departmentLabel}`,
    o.employmentStatusLabel && `Employment: ${o.employmentStatusLabel}`,
    o.isRemote ? `Location: Remote${where ? ` (${where})` : ""}` : where && `Location: ${where}`,
  ].filter((l): l is string => typeof l === "string" && l.length > 0);
  const about = htmlToText(o.description ?? "", url);
  const text = [facts.join("\n"), about.text].filter(Boolean).join("\n\n") || title;
  const posted = o.datePosted && /^\d{4}-\d{2}-\d{2}$/.test(o.datePosted) ? o.datePosted : null;
  const meta = {
    ...(o.departmentLabel ? { department: o.departmentLabel } : {}),
    ...(o.employmentStatusLabel ? { employment: o.employmentStatusLabel } : {}),
    ...(about.links.length ? { links: about.links } : {}),
  };
  return {
    url,
    ...(title ? { title: title.slice(0, 300) } : {}),
    text,
    ...(posted ? { publishedAt: `${posted}T00:00:00.000Z` } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

export default adapter;
