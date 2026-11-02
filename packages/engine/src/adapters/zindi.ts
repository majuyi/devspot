import type { RawItemInput } from "@devspot/schema";
import { z } from "zod";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { canonicalizeUrl } from "../dedupe.js";
import { htmlToText } from "../fetchers/html-text.js";
import { HttpStatusError, RobotsDisallowed } from "../http.js";

/** Open competitions sit on the first page; this bounds a run if the ordering ever changes. */
export const ZINDI_PAGE_LIMIT = 5;
export const ZINDI_PER_PAGE = 100;

const Listed = z.object({ id: z.string(), title: z.string(), open: z.boolean() });
const Page = z.object({
  data: z.array(Listed),
  meta: z.object({ open_count: z.number() }),
});

const Block = z.object({ text: z.string(), type: z.string().optional() });
const Detail = z.object({
  data: z.object({
    id: z.string(),
    title: z.string(),
    subtitle: z.string().nullish(),
    start_time: z.string().nullish(),
    end_time: z.string().nullish(),
    entries_close_at: z.string().nullish(),
    reward: z.string().nullish(),
    difficulty: z.array(z.string()).nullish(),
    skills: z.array(z.string()).nullish(),
    is_access_restricted: z.boolean().nullish(),
    secret_code_required: z.boolean().nullish(),
    pages: z
      .array(z.object({ title: z.string().nullish(), content_html: z.string().nullish() }))
      .nullish(),
    rules: z.object({ content: z.object({ blocks: z.array(Block) }).nullish() }).nullish(),
  }),
});
type Competition = z.infer<typeof Detail>["data"];

/**
 * Zindi's competitions API (api.zindi.world, the JSON behind zindi.africa/competitions):
 * data science and AI competitions, many for African participants. Open competitions are
 * listed first and the API reports how many there are, so pages are read until that many are
 * found. Each new competition costs a request for its description and rules, which hold
 * "Who can compete". Closed ones are not opportunities.
 */
const adapter: Adapter = {
  key: "zindi",
  async fetch(source, http) {
    const open: z.infer<typeof Listed>[] = [];
    for (let page = 0; page < ZINDI_PAGE_LIMIT; page++) {
      const url = new URL(source.url);
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(ZINDI_PER_PAGE));
      const parsed = Page.safeParse(await http.json(url.href));
      if (!parsed.success)
        throw new AdapterLayoutChanged("zindi", url.href, parsed.error.issues[0]?.message ?? "");
      open.push(...parsed.data.data.filter((c) => c.open));
      if (open.length >= parsed.data.meta.open_count || parsed.data.data.length < ZINDI_PER_PAGE)
        break;
    }
    const known = source.knownUrls ?? new Set<string>();
    const api = new URL(source.url);
    const items: RawItemInput[] = [];
    for (const c of open) {
      const url = `https://zindi.africa/competitions/${encodeURIComponent(c.id)}`;
      if (known.has(canonicalizeUrl(url))) continue;
      const detailUrl = `${api.origin}${api.pathname.replace(/\/$/, "")}/${encodeURIComponent(c.id)}`;
      let body: unknown;
      try {
        body = await http.json(detailUrl);
      } catch (e) {
        if (e instanceof HttpStatusError || e instanceof RobotsDisallowed) continue;
        throw e;
      }
      const detail = Detail.safeParse(body);
      if (!detail.success)
        throw new AdapterLayoutChanged("zindi", detailUrl, detail.error.issues[0]?.message ?? "");
      items.push(toItem(url, detail.data.data));
    }
    return items;
  },
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "13 December 2026, 12:00 UTC": the API's own instant, written so the rules read it exactly. */
export function utcLine(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function rulesText(c: Competition): string {
  return (c.rules?.content?.blocks ?? [])
    .map((b) => (b.type?.endsWith("list-item") ? `- ${b.text.trim()}` : b.text.trim()))
    .filter((line) => line && line !== "-")
    .join("\n");
}

function toItem(url: string, c: Competition): RawItemInput {
  const title = c.title.replace(/\s+/g, " ").trim();
  const closes = utcLine(c.entries_close_at ?? c.end_time);
  const ends = c.entries_close_at ? utcLine(c.end_time) : undefined;
  const facts = [
    "Host: Zindi",
    "Location: Online",
    utcLine(c.start_time) && `Starts: ${utcLine(c.start_time)}`,
    closes && `Deadline: ${closes}`,
    ends && `Competition ends: ${ends}`,
    c.reward && `Prize: ${c.reward}`,
    c.difficulty?.length && `Difficulty: ${c.difficulty.join(", ")}`,
    c.skills?.length && `Skills: ${c.skills.join(", ")}`,
    (c.is_access_restricted || c.secret_code_required) &&
      "Access: Zindi marks this competition as restricted.",
  ].filter((l): l is string => typeof l === "string" && l.length > 0);
  const pages = (c.pages ?? [])
    .map((p) => {
      const body = htmlToText(p.content_html ?? "", url).text;
      return body && (p.title ? `${p.title}\n\n${body}` : body);
    })
    .filter(Boolean);
  const rules = rulesText(c);
  const text = [facts.join("\n"), c.subtitle?.trim(), ...pages, rules && `Rules\n\n${rules}`]
    .filter(Boolean)
    .join("\n\n");
  return { url, title: title.slice(0, 300), text };
}

export default adapter;
