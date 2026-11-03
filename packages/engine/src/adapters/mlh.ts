import type { RawItemInput } from "@devspot/schema";
import { load } from "cheerio";
import { z } from "zod";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { absoluteHttpUrl, utcLine } from "../fetchers/util.js";

const Event = z.object({
  name: z.string(),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  url: z.string().nullish(),
  websiteUrl: z.string().nullish(),
  location: z.string().nullish(),
  formatType: z.string(),
  customFields: z
    .object({
      underserved_types: z.array(z.string()).nullish(),
      hackathon_focus: z.array(z.string()).nullish(),
    })
    .nullish(),
});
type Event = z.infer<typeof Event>;

const SeasonPage = z.object({
  props: z.object({ upcomingEvents: z.array(Event) }),
});

const clean = (s: string | null | undefined) =>
  s?.replace(/\s+/g, " ").replace(/ ,/g, ",").trim() || undefined;

/**
 * MLH's season page (mlh.com/seasons/<year>/events) renders every event of the season as JSON
 * in `<script data-page="app">`. Event pages on mlh.com carry no description, so items come
 * from the listing alone and cost no further requests. Past events are not opportunities, and
 * in-person ones are almost all on campuses in North America and Europe, so only online and
 * hybrid events are kept, as Devpost keeps online ones. The URL is the event's own site,
 * where readers register.
 */
const adapter: Adapter = {
  key: "mlh",
  async fetch(source, http) {
    const html = await http.text(source.url, { accept: "text/html" });
    const raw = load(html)('script[data-page="app"]').text();
    if (!raw) throw new AdapterLayoutChanged("mlh", source.url, "no data-page script");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new AdapterLayoutChanged("mlh", source.url, "data-page is not JSON");
    }
    const parsed = SeasonPage.safeParse(data);
    if (!parsed.success)
      throw new AdapterLayoutChanged("mlh", source.url, parsed.error.issues[0]?.message ?? "");
    const items: RawItemInput[] = [];
    for (const event of parsed.data.props.upcomingEvents) {
      if (event.formatType === "physical") continue;
      const url =
        absoluteHttpUrl(event.websiteUrl ?? undefined, source.url) ??
        absoluteHttpUrl(event.url ?? undefined, source.url);
      if (url) items.push(toItem(url, event));
    }
    return items;
  },
};

function toItem(url: string, e: Event): RawItemInput {
  const title = clean(e.name) ?? url;
  const place = clean(e.location);
  const location =
    e.formatType === "digital"
      ? "Online"
      : `Hybrid, online or in person${place ? ` in ${place}` : ""}`;
  const focus = e.customFields?.hackathon_focus?.filter(Boolean) ?? [];
  const underserved = e.customFields?.underserved_types?.filter(Boolean) ?? [];
  const facts = [
    "Host: Major League Hacking (MLH member event)",
    utcLine(e.startsAt) && `Date: ${utcLine(e.startsAt)}`,
    utcLine(e.endsAt) && `Ends: ${utcLine(e.endsAt)}`,
    `Location: ${location}`,
    focus.length && `Focus: ${focus.join(", ")}`,
    underserved.length && `Diversity focus: ${underserved.join(", ")}`,
  ].filter((l): l is string => typeof l === "string" && l.length > 0);
  return { url, title: title.slice(0, 300), text: facts.join("\n") };
}

export default adapter;
