import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import outreachy from "../../src/adapters/outreachy.js";
import { extractRules } from "../../src/extract/rules.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const ORIGIN = "https://www.outreachy.org";
const PATH = "/apply/project-selection/";
const source = findSource("outreachy/site");

const draft = (title: string, text: string, now: string) =>
  extractRules({
    item: { title, text, canonicalUrl: `${ORIGIN}${PATH}`, publishedAt: null, meta: undefined },
    org: { category: "ossProgram", country: "US" },
    now: new Date(now),
  }).draft;

describe("outreachy adapter", () => {
  it("replays the round as one remote item whose deadline is the initial application", async () => {
    const { actual } = await replaySource({ source, fetch: fetchSource });
    expect(actual.items).toHaveLength(1);
    const [item] = actual.items;
    expect(item?.title).toBe("Outreachy December 2026 to March 2027 Internships");
    expect(item?.text).toContain("Deadline: Aug. 31, 2026 at 4pm UTC (initial application)");
    expect(item?.text).toContain("Initial applications are closed");
    const title = item?.title ?? "";
    const text = item?.text ?? "";
    // Before the initial deadline, that is the deadline.
    const open = draft(title, text, "2026-08-25T00:00:00Z");
    expect(open.deadlineAt).toBe("2026-08-31T16:00:00.000Z");
    expect(open.locationMode).toBe("remote");
    // After it, the final application date (9 November) must not stand in for it.
    expect(draft(title, text, "2026-11-03T00:00:00Z").deadlineKind).toBe("unknown");
  });

  describe("against a stub page", () => {
    let agent: MockAgent;
    beforeEach(() => {
      agent = new MockAgent();
      agent.disableNetConnect();
      agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(404, "").persist();
    });
    afterEach(async () => {
      await agent.close();
    });
    const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });
    const serve = (body: string) =>
      agent.get(ORIGIN).intercept({ path: PATH }).reply(200, `<html><body>${body}</body></html>`);
    const row = (when: string, what: string) => `<tr><td><b>${when}</b></td><td>${what}</td></tr>`;

    it("writes the timeline, the notice and the project areas", async () => {
      serve(`
        <div class="card border-info"><div class="card-header">Initial applications are open</div></div>
        <h1>Outreachy May 2027 to August 2027 Internships</h1>
        <h2>Timeline</h2>
        <table>${row("Jan. 18, 2027 at 4pm UTC", "Initial applications open")}${row("Feb. 1, 2027 at 4pm UTC", "Initial application deadline")}${row("April 6, 2027<br> at 4pm UTC", "Final application deadline")}</table>
        <div class="card border-info" id="project-skills-key"><div class="card-header">Project skills key</div></div>
        <h2 id="open-projects">Outreachy Open Projects</h2>
        <p>Outreachy is offering internship projects in the following areas:</p>
        <ul><li>Rust - 2 projects</li><li> Python, </li></ul>`);
      expect(await outreachy.fetch(source, http())).toEqual([
        {
          url: `${ORIGIN}${PATH}`,
          title: "Outreachy May 2027 to August 2027 Internships",
          text: [
            "Host: Outreachy\nLocation: Remote\nDeadline: Feb. 1, 2027 at 4pm UTC (initial application)",
            "Initial applications are open",
            "Timeline\n\nInitial applications open: Jan. 18, 2027 at 4pm UTC\nFinal application, for applicants whose initial application was approved: April 6, 2027 at 4pm UTC",
            "Internship projects are offered in these areas:\n- Rust - 2 projects\n- Python",
          ].join("\n\n"),
        },
      ]);
    });

    it("gives the round without a deadline between rounds, when there is no timeline", async () => {
      serve("<h1>Outreachy internships</h1><p>The next round opens in January.</p>");
      const [item] = await outreachy.fetch(source, http());
      expect(item?.text).toBe("Host: Outreachy\nLocation: Remote");
    });

    it("throws AdapterLayoutChanged without a heading, or with a timeline but no initial deadline", async () => {
      serve("<p>hi</p>");
      await expect(outreachy.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
      serve(`<h1>Round</h1><table>${row("April 6, 2027", "Final application deadline")}</table>`);
      await expect(outreachy.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
