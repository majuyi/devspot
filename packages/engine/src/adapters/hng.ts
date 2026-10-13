import { load } from "cheerio";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { htmlToText } from "../fetchers/html-text.js";

/** Sections about past cohorts and alumni, not the programme that is open or next. */
const PAST = /past cohorts|featured hng talent|life-changing stories/i;

/**
 * hng.tech/internship is one page about the current cohort, so it yields one item. The
 * cohort number comes from the page ("Join HNG Internship 15"); identity across cohorts is
 * dedupe's job (docs/04 §2), which strips cohort numbers from titles.
 */
const adapter: Adapter = {
  key: "hng",
  async fetch(source, http) {
    const html = await http.text(source.url, { accept: "text/html" });
    const $ = load(html);
    const main = $("main").first();
    main.find("nav").remove();
    main.find("section").each((_, el) => {
      if (PAST.test($(el).find("h2").first().text())) $(el).remove();
    });
    const { text, links } = htmlToText(main.html() ?? "", source.url);
    if (!text) throw new AdapterLayoutChanged("hng", source.url, "no text in <main>");
    const cohorts = [
      ...$("body")
        .text()
        .matchAll(/HNG Internship (\d+)\b/g),
    ].map((m) => Number(m[1]));
    const title = cohorts.length ? `HNG Internship ${Math.max(...cohorts)}` : "HNG Internship";
    return [{ url: source.url, title, text, ...(links.length ? { meta: { links } } : {}) }];
  },
};

export default adapter;
