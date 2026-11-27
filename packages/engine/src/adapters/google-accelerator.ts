import { load } from "cheerio";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

const CALENDAR = "https://www.google.com/calendar/event";
const DAY = /^(\d{4})(\d{2})(\d{2})/;

/** A calendar link's `dates` (`20260318/20260318`, or with a time) as its first day. */
function dayOf(dates: string | null): string | undefined {
  const m = dates?.match(DAY);
  if (!m) return undefined;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
  );
}

/**
 * A Google for Startups Accelerator programme page (startup.google.com/programs/accelerator/
 * <region>/), one item per page, as Outreachy's is: each round is posted on the same page and
 * ADR 0019 reopens the row when a later one is. The visible timeline puts each date before its
 * label ("March 18, 2026 / Applications Close"), which a generic reader loses, so the dates
 * come from the timeline's "Add to calendar" links, whose `text` names the step and `dates`
 * gives the day. "Applications Close" becomes the `Deadline:` line. Between rounds the page
 * may have no timeline; the item then states no date. The rest of the page is mostly alumni
 * startups and their countries, so only the description and the sentence on how sessions are
 * run are kept: the alumni list would read as a place. When that sentence says sessions are
 * remote and in-person, a `Location: Hybrid` line says so in the word the rules read.
 */
const adapter = {
  key: "google-accelerator",
  async fetch(source, http) {
    const $ = load(await http.text(source.url, { accept: "text/html" }));
    const title = clean(
      $('meta[property="og:title"]').attr("content") ?? $("title").first().text(),
    );
    if (!title) throw new AdapterLayoutChanged("google-accelerator", source.url, "no title");

    const steps = new Map<string, string>();
    $(`a[href^="${CALENDAR}"]`).each((_, a) => {
      const url = new URL($(a).attr("href") ?? "", CALENDAR);
      const day = dayOf(url.searchParams.get("dates"));
      const step = clean(url.searchParams.get("text") ?? "")
        .replace(title, "")
        .trim();
      if (day && step && !steps.has(step)) steps.set(step, day);
    });
    const lines = [...steps].map(([step, day]) =>
      /^applications? close/i.test(step)
        ? `Deadline: ${day}`
        : /^applications? open/i.test(step)
          ? `Applications open: ${day}`
          : `${step}: ${day}`,
    );

    const description = clean($('meta[name="description"]').attr("content") ?? "");
    const sessions = $("p, li")
      .toArray()
      .map((el) => clean($(el).text()))
      .find((t) => /\bremote and in-person\b|\bin-person and remote\b/i.test(t));
    // The rules read only the word "hybrid"; the page's own words say the same thing.
    const facts = [
      "Host: Google for Startups",
      ...(sessions ? ["Location: Hybrid"] : []),
      ...lines,
    ];
    const text = [facts.join("\n"), description, sessions].filter(Boolean).join("\n\n");
    return [{ url: source.url, title: title.slice(0, 300), text }];
  },
} satisfies Adapter;

export default adapter;
