import type { RawItemInput } from "@devspot/schema";
import { load } from "cheerio";
import { z } from "zod";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { canonicalizeUrl } from "../dedupe.js";
import { htmlToText } from "../fetchers/html-text.js";
import { absoluteHttpUrl } from "../fetchers/util.js";
import { type HttpClient, HttpStatusError, RobotsDisallowed } from "../http.js";

/** Devpost serves at most 40 per page; 10 pages is several times today's online count. */
export const DEVPOST_PER_PAGE = 40;
export const DEVPOST_PAGE_LIMIT = 10;
/** Hackathon pages fetched per run. The rest wait for the next run, in listing order. */
export const DEVPOST_DETAIL_LIMIT = 10;

const Hackathon = z.object({
  title: z.string(),
  url: z.string(),
  open_state: z.string().optional(),
  organization_name: z.string().nullish(),
  submission_period_dates: z.string().nullish(),
  displayed_location: z.object({ location: z.string().nullish() }).nullish(),
  prize_amount: z.string().nullish(),
  prizes_counts: z.object({ cash: z.number(), other: z.number() }).nullish(),
  themes: z.array(z.object({ name: z.string() })).nullish(),
  invite_only: z.boolean().nullish(),
  eligibility_requirement_invite_only_description: z.string().nullish(),
});
type Hackathon = z.infer<typeof Hackathon>;

const Page = z.object({
  hackathons: z.array(Hackathon),
  meta: z.object({ total_count: z.number() }),
});

type Listed = { url: string; hackathon: Hackathon };

/**
 * Devpost's public listing API (the JSON behind devpost.com/hackathons): open and upcoming
 * online hackathons. Ended ones are not opportunities, and in-person ones are almost all on
 * campuses abroad. Like the sitemap fetcher, it returns only hackathons not in `knownUrls`,
 * at most DEVPOST_DETAIL_LIMIT per run, because each costs a request for its own page: that
 * page holds the deadline with its time zone and "Who can participate", which the listing
 * lacks. Fields that change daily (time left, registrations) stay out of `text`.
 */
const adapter: Adapter = {
  key: "devpost",
  async fetch(source, http) {
    const known = source.knownUrls ?? new Set<string>();
    const fresh = (await listOnline(source.url, http))
      .filter((l) => !known.has(canonicalizeUrl(l.url)))
      .slice(0, DEVPOST_DETAIL_LIMIT);
    const items: RawItemInput[] = [];
    for (const listed of fresh) {
      try {
        // Devpost's firewall answers 403 to hackathon pages unless `accept` is exactly */*.
        items.push(toItem(listed, await http.text(listed.url, { accept: "*/*" })));
      } catch (e) {
        // A page that is gone or disallowed stays unknown and is tried again next run.
        if (!(e instanceof HttpStatusError || e instanceof RobotsDisallowed)) throw e;
      }
    }
    return items;
  },
};

async function listOnline(apiUrl: string, http: HttpClient): Promise<Listed[]> {
  const listed: Listed[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= DEVPOST_PAGE_LIMIT; page++) {
    const url = new URL(apiUrl);
    url.searchParams.append("status[]", "upcoming");
    url.searchParams.append("status[]", "open");
    url.searchParams.append("challenge_type[]", "online");
    url.searchParams.set("per_page", String(DEVPOST_PER_PAGE));
    url.searchParams.set("page", String(page));
    const parsed = Page.safeParse(await http.json(url.href));
    if (!parsed.success)
      throw new AdapterLayoutChanged("devpost", url.href, parsed.error.issues[0]?.message ?? "");
    for (const hackathon of parsed.data.hackathons) {
      const abs = absoluteHttpUrl(hackathon.url, "https://devpost.com/");
      if (abs && !seen.has(abs)) {
        seen.add(abs);
        listed.push({ url: abs, hackathon });
      }
    }
    const fetched = page * DEVPOST_PER_PAGE;
    if (!parsed.data.hackathons.length || fetched >= parsed.data.meta.total_count) break;
  }
  return listed;
}

function toItem({ url, hackathon: h }: Listed, html: string): RawItemInput {
  const $ = load(html);
  const main = $("#main");
  if (!main.length) throw new AdapterLayoutChanged("devpost", url, "no #main on the page");

  // The excluded countries sit in a tooltip's title ("standard exceptions") or, when the
  // list is long, in a modal the link opens. Either way they go into the line itself.
  $("#eligibility-list [title]").each((_, el) => {
    $(el).text(`${$(el).text().trim()} (${$(el).attr("title")})`);
  });
  $("#eligibility-list [data-reveal-id]").each((_, el) => {
    const id = $(el).attr("data-reveal-id") ?? "";
    const countries = $(`[id="${id}"] li`)
      .toArray()
      .map((li) => $(li).text().trim())
      .filter(Boolean);
    if (countries.length) $(el).text(`${$(el).text().trim()} (${countries.join(", ")})`);
  });
  const eligibility = $("#eligibility-list > li")
    .toArray()
    .map((li) => $(li).text().replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const deadline = htmlToText($("#challenge-information").html() ?? "")
    .text.split("\n")
    .find((line) => line.startsWith("Deadline:"));
  const about = htmlToText(main.html() ?? "", url);

  const title = h.title.replace(/\s+/g, " ").trim();
  const prize = h.prize_amount ? load(h.prize_amount).text().trim() : "";
  const counts = h.prizes_counts
    ? ` (${h.prizes_counts.cash} cash, ${h.prizes_counts.other} other)`
    : "";
  const themes = (h.themes ?? []).map((t) => t.name);
  const facts = [
    h.organization_name && `Host: ${h.organization_name}`,
    h.open_state && `Status: ${h.open_state}`,
    h.submission_period_dates && `Submission period: ${h.submission_period_dates}`,
    deadline,
    h.displayed_location?.location && `Location: ${h.displayed_location.location}`,
    prize && `Prizes: ${prize}${counts}`,
    themes.length && `Themes: ${themes.join(", ")}`,
    h.invite_only &&
      `Invite only.${h.eligibility_requirement_invite_only_description ? ` ${h.eligibility_requirement_invite_only_description}` : ""}`,
  ].filter((l): l is string => typeof l === "string" && l.length > 0);
  const blocks = [
    facts.join("\n"),
    eligibility.length && `Who can participate\n\n${eligibility.map((e) => `- ${e}`).join("\n")}`,
    about.text,
  ].filter((b): b is string => typeof b === "string" && b.length > 0);
  const meta = {
    ...(about.links.length ? { links: about.links } : {}),
    ...(themes.length ? { categories: themes } : {}),
  };
  return {
    url,
    ...(title ? { title: title.slice(0, 300) } : {}),
    text: blocks.join("\n\n") || title,
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

export default adapter;
