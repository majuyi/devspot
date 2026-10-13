import type { RawItemInput } from "@devspot/schema";
import { load } from "cheerio";
import { z } from "zod";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { absoluteHttpUrl } from "../fetchers/util.js";

/** Devpost serves at most 40 per page; 10 pages is twice today's open and upcoming count. */
export const DEVPOST_PER_PAGE = 40;
export const DEVPOST_PAGE_LIMIT = 10;

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

/**
 * Devpost's public listing API (the JSON behind devpost.com/hackathons), open and upcoming
 * only: ended hackathons are not "currently listed" opportunities. The listing has no
 * description, so `text` is built from the listing's own fields. Fields that change daily
 * (time left, registrations) stay out of `text`, so the content hash moves only when the
 * hackathon does.
 */
const adapter: Adapter = {
  key: "devpost",
  async fetch(source, http) {
    const items: RawItemInput[] = [];
    const seen = new Set<string>();
    for (let page = 1; page <= DEVPOST_PAGE_LIMIT; page++) {
      const url = new URL(source.url);
      url.searchParams.append("status[]", "upcoming");
      url.searchParams.append("status[]", "open");
      url.searchParams.set("per_page", String(DEVPOST_PER_PAGE));
      url.searchParams.set("page", String(page));
      const parsed = Page.safeParse(await http.json(url.href));
      if (!parsed.success)
        throw new AdapterLayoutChanged("devpost", url.href, parsed.error.issues[0]?.message ?? "");
      for (const h of parsed.data.hackathons) {
        const item = toItem(h);
        if (item && !seen.has(item.url)) {
          seen.add(item.url);
          items.push(item);
        }
      }
      const fetched = page * DEVPOST_PER_PAGE;
      if (!parsed.data.hackathons.length || fetched >= parsed.data.meta.total_count) break;
    }
    return items;
  },
};

function toItem(h: Hackathon): RawItemInput | undefined {
  const url = absoluteHttpUrl(h.url, "https://devpost.com/");
  if (!url) return undefined;
  const title = h.title.replace(/\s+/g, " ").trim();
  const prize = h.prize_amount ? load(h.prize_amount).text().trim() : "";
  const counts = h.prizes_counts
    ? ` (${h.prizes_counts.cash} cash, ${h.prizes_counts.other} other)`
    : "";
  const themes = (h.themes ?? []).map((t) => t.name);
  const lines = [
    h.organization_name && `Host: ${h.organization_name}`,
    h.open_state && `Status: ${h.open_state}`,
    h.submission_period_dates && `Submission period: ${h.submission_period_dates}`,
    h.displayed_location?.location && `Location: ${h.displayed_location.location}`,
    prize && `Prizes: ${prize}${counts}`,
    themes.length && `Themes: ${themes.join(", ")}`,
    h.invite_only &&
      `Invite only.${h.eligibility_requirement_invite_only_description ? ` ${h.eligibility_requirement_invite_only_description}` : ""}`,
  ].filter((l): l is string => typeof l === "string" && l.length > 0);
  return {
    url,
    ...(title ? { title: title.slice(0, 300) } : {}),
    text: lines.length ? lines.join("\n") : title,
    ...(themes.length ? { meta: { categories: themes } } : {}),
  };
}

export default adapter;
