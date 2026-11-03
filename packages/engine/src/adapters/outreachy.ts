import { load } from "cheerio";
import { type Adapter, AdapterLayoutChanged } from "../adapter.js";
import { htmlToText } from "../fetchers/html-text.js";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/**
 * outreachy.org/apply/project-selection/ is one page about the current round, so it yields one
 * item, as HNG's page does; identity across rounds is dedupe's job. The page's timeline has
 * two deadlines. Only the initial application deadline is one a new applicant can meet: the
 * final application is open only to those whose initial application was approved. So the
 * initial one is written as the `Deadline:` line and the final one in words the rules do not
 * read as a deadline. Otherwise a closed round would show the final date as if anyone could
 * still apply. Project cards are left out: their details are hidden without a login and each
 * repeats the final deadline.
 */
const adapter: Adapter = {
  key: "outreachy",
  async fetch(source, http) {
    const $ = load(await http.text(source.url, { accept: "text/html" }));
    const title = clean($("h1").first().text());
    if (!title) throw new AdapterLayoutChanged("outreachy", source.url, "no <h1>");

    const timeline: string[] = [];
    let deadline: string | undefined;
    $("h1")
      .first()
      .nextAll("table")
      .first()
      .find("tr")
      .each((_, tr) => {
        const [when, what] = $(tr)
          .find("td")
          .toArray()
          .map((td) => clean($(td).text()));
        if (!when || !what) return;
        if (/^initial application deadline$/i.test(what)) deadline = when;
        else if (/^final application deadline$/i.test(what))
          timeline.push(
            `Final application, for applicants whose initial application was approved: ${when}`,
          );
        else timeline.push(`${what}: ${when}`);
      });
    if (timeline.length && !deadline)
      throw new AdapterLayoutChanged(
        "outreachy",
        source.url,
        "timeline has no initial application deadline",
      );

    // The notice above the round, e.g. "Initial applications are closed".
    const notices = $(".card.border-info")
      .not("#project-skills-key")
      .toArray()
      .map((card) => htmlToText($(card).html() ?? "", source.url).text)
      .filter(Boolean);
    const areas = $("#open-projects")
      .nextAll("ul")
      .first()
      .find("li")
      .toArray()
      .map((li) => clean($(li).text()).replace(/,$/, ""))
      .filter(Boolean);

    const facts = [
      "Host: Outreachy",
      "Location: Remote",
      deadline && `Deadline: ${deadline} (initial application)`,
    ].filter(Boolean);
    const text = [
      facts.join("\n"),
      ...notices,
      timeline.length && `Timeline\n\n${timeline.join("\n")}`,
      areas.length &&
        `Internship projects are offered in these areas:\n${areas.map((a) => `- ${a}`).join("\n")}`,
    ]
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .join("\n\n");
    return [{ url: source.url, title: title.slice(0, 300), text }];
  },
};

export default adapter;
