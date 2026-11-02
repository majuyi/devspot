import type { RawItemInput } from "@devspot/schema";
import { load } from "cheerio";
import { z } from "zod";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { canonicalizeUrl } from "../dedupe.js";
import { htmlToText } from "../fetchers/html-text.js";
import { absoluteHttpUrl, utcLine } from "../fetchers/util.js";
import { type HttpClient, HttpStatusError, RobotsDisallowed } from "../http.js";

/** English dates and text; Bevy localises by Accept-Language. */
const HEADERS = { accept: "text/html", "accept-language": "en" };

const Listed = z.object({ title: z.string(), url: z.string(), start_date: z.string().nullish() });
const ChapterProps = z.object({
  props: z.object({
    pageProps: z.object({
      prerenderData: z.object({
        upcomingEvents: z.object({ results: z.array(Listed) }),
      }),
    }),
  }),
});

const EventData = z.object({
  title: z.string(),
  description: z.string().nullish(),
  description_short: z.string().nullish(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  is_virtual_event: z.boolean().nullish(),
  event_type_title: z.string().nullish(),
  venue_name: z.string().nullish(),
  venue_address: z.string().nullish(),
  venue_city: z.string().nullish(),
});
const EventProps = z.object({ props: z.object({ pageProps: z.object({ eventData: EventData }) }) });
type EventData = z.infer<typeof EventData>;

/** The `__NEXT_DATA__` JSON Bevy pages render on the server. */
function nextData(html: string, url: string): unknown {
  const raw = load(html)("script#__NEXT_DATA__").text();
  if (!raw) throw new AdapterLayoutChanged("bevy", url, "no __NEXT_DATA__ on the page");
  try {
    return JSON.parse(raw);
  } catch {
    throw new AdapterLayoutChanged("bevy", url, "__NEXT_DATA__ is not JSON");
  }
}

/**
 * Any chapter on a Bevy community site (gdg.community.dev for Google Developer Groups). The
 * chapter page renders its upcoming events into `__NEXT_DATA__`; robots.txt disallows `/api/`,
 * so the JSON API is off limits and the pages are read instead. Each new event costs a
 * request for its own page, which holds the venue, the end time and whether it is virtual.
 * Past events are not opportunities.
 */
const adapter: Adapter = {
  key: "bevy",
  async fetch(source, http) {
    const parsed = ChapterProps.safeParse(
      nextData(await http.text(source.url, HEADERS), source.url),
    );
    if (!parsed.success)
      throw new AdapterLayoutChanged("bevy", source.url, parsed.error.issues[0]?.message ?? "");
    const known = source.knownUrls ?? new Set<string>();
    const items: RawItemInput[] = [];
    for (const listed of parsed.data.props.pageProps.prerenderData.upcomingEvents.results) {
      const url = absoluteHttpUrl(listed.url, source.url);
      if (!url || known.has(canonicalizeUrl(url))) continue;
      const event = await eventPage(url, http);
      if (event) items.push(toItem(url, event));
    }
    return items;
  },
};

async function eventPage(url: string, http: HttpClient): Promise<EventData | undefined> {
  let html: string;
  try {
    html = await http.text(url, HEADERS);
  } catch (e) {
    // An event withdrawn since the chapter page was read is tried again next run.
    if (e instanceof HttpStatusError || e instanceof RobotsDisallowed) return undefined;
    throw e;
  }
  const parsed = EventProps.safeParse(nextData(html, url));
  if (!parsed.success)
    throw new AdapterLayoutChanged("bevy", url, parsed.error.issues[0]?.message ?? "");
  return parsed.data.props.pageProps.eventData;
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() || undefined;

function toItem(url: string, e: EventData): RawItemInput {
  const title = clean(e.title) ?? url;
  const city = clean(e.venue_city);
  const named = [clean(e.venue_name), clean(e.venue_address)].filter(Boolean).join(", ");
  const place =
    city && !named.toLowerCase().includes(city.toLowerCase())
      ? [named, city].filter(Boolean).join(", ")
      : named;
  // Bevy flags in-person DevFests as virtual when registration is external, so a stated
  // venue wins; "Online" only when there is no venue at all.
  const location = place || (e.is_virtual_event ? "Online" : undefined);
  const facts = [
    utcLine(e.start_date) && `Date: ${utcLine(e.start_date)}`,
    utcLine(e.end_date) && `Ends: ${utcLine(e.end_date)}`,
    location && `Location: ${location}`,
    clean(e.event_type_title) && `Registration: ${clean(e.event_type_title)}`,
  ].filter(Boolean);
  const about = htmlToText(e.description ?? "", url);
  const text =
    [facts.join("\n"), about.text || clean(e.description_short)].filter(Boolean).join("\n\n") ||
    title;
  return {
    url,
    title: title.slice(0, 300),
    text,
    ...(about.links.length ? { meta: { links: about.links } } : {}),
  };
}

export default adapter;
