import { MockAgent } from "undici";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdapterLayoutChanged } from "../../src/adapter.js";
import hng from "../../src/adapters/hng.js";
import { fetchSource } from "../../src/fetch.js";
import { replaySource } from "../../src/fixtures/replay.js";
import { HttpClient } from "../../src/http.js";
import { findSource } from "../../src/registry.js";

const ORIGIN = "https://hng.tech";
const source = findSource("hng/site");

describe("hng adapter", () => {
  it("replays the fixture to one item for the current cohort", async () => {
    const { actual } = await replaySource({ source, fetch: fetchSource });
    expect(actual.items).toHaveLength(1);
    const [item] = actual.items;
    expect(item?.url).toBe(`${ORIGIN}/internship`);
    expect(item?.title).toMatch(/^HNG Internship \d+$/);
    expect(item?.text).not.toContain("Check out past Cohorts");
    expect(item?.text).not.toContain("Life-changing Stories");
  });

  describe("against a stub page", () => {
    let agent: MockAgent;
    beforeEach(() => {
      agent = new MockAgent();
      agent.disableNetConnect();
      agent.get(ORIGIN).intercept({ path: "/robots.txt" }).reply(404, "");
    });
    afterEach(async () => {
      await agent.close();
    });
    const http = () => new HttpClient({ dispatcher: agent, minIntervalMs: 0 });

    it("takes the highest cohort number and drops past cohorts", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: "/internship" })
        .reply(
          200,
          `<html><body><main><div>
          <section><h2>Become an AI engineer</h2><p>Alumni of HNG Internship 9.</p></section>
          <section><div><h2>Check out past Cohorts!</h2></div><a href="/internship/i13">HNG Internship 13</a></section>
          </div></main><footer>Join HNG Internship 15</footer></body></html>`,
        );
      expect(await hng.fetch(source, http())).toEqual([
        {
          url: `${ORIGIN}/internship`,
          title: "HNG Internship 15",
          text: "Become an AI engineer\n\nAlumni of HNG Internship 9.",
        },
      ]);
    });

    it("throws AdapterLayoutChanged when <main> is missing or empty", async () => {
      agent
        .get(ORIGIN)
        .intercept({ path: "/internship" })
        .reply(200, "<html><body>Hi</body></html>");
      await expect(hng.fetch(source, http())).rejects.toBeInstanceOf(AdapterLayoutChanged);
    });
  });
});
