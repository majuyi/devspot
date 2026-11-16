import { decodePreferences } from "@devspot/schema";
import { describe, expect, it } from "vitest";
import { POST } from "../../src/app/api/prefs/route";

const post = (fields: [string, string][], headers: Record<string, string> = {}) => {
  const body = new URLSearchParams(fields);
  return POST(
    new Request("https://devspot.test/api/prefs", {
      method: "POST",
      headers: {
        host: "devspot.test",
        "content-type": "application/x-www-form-urlencoded",
        ...headers,
      },
      body,
    }),
  );
};
const cookies = (res: Response) =>
  Object.fromEntries(
    res.headers.getSetCookie().map((c) => {
      const [pair, ...attrs] = c.split("; ");
      const [name, ...value] = (pair ?? "").split("=");
      return [name, { value: value.join("="), attrs }];
    }),
  );

describe("POST /api/prefs (docs/01 §2)", () => {
  it("saves the choices in the prefs cookie for a year and sends the reader to the feed", async () => {
    const res = await post([
      ["kinds", "job"],
      ["kinds", "internship"],
      ["city", "lagos"],
      ["tags", "ml"],
      ["next", "/feed"],
    ]);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://devspot.test/feed");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const c = cookies(res);
    expect(decodePreferences(c.prefs?.value)).toEqual({
      v: 1,
      kinds: ["job", "internship"],
      city: "lagos",
      tags: ["ml"],
    });
    expect(c.prefs?.attrs).toEqual(["Path=/", "Max-Age=31536000", "SameSite=Lax", "HttpOnly"]);
    // The plain copy the home rewrite and the header read.
    expect(c.city).toEqual({
      value: "lagos",
      attrs: ["Path=/", "Max-Age=31536000", "SameSite=Lax"],
    });
  });

  it("with no city, removes the city cookie but keeps the feed", async () => {
    const c = cookies(await post([["kinds", "event"]]));
    expect(decodePreferences(c.prefs?.value)).toEqual({ v: 1, kinds: ["event"], tags: [] });
    expect(c.city).toEqual({ value: "", attrs: ["Path=/", "Max-Age=0", "SameSite=Lax"] });
  });

  it("nothing chosen is a feed of everything, not an error", async () => {
    const c = cookies(await post([["city", ""]]));
    expect(decodePreferences(c.prefs?.value)).toEqual({ v: 1, kinds: [], tags: [] });
  });

  it("clear removes both cookies", async () => {
    const res = await post([
      ["kinds", "job"],
      ["city", "lagos"],
      ["clear", "1"],
    ]);
    expect(res.status).toBe(303);
    const c = cookies(res);
    expect(c.prefs?.value).toBe("");
    expect(c.prefs?.attrs).toContain("Max-Age=0");
    expect(c.city?.value).toBe("");
    expect(c.city?.attrs).toContain("Max-Age=0");
  });

  it("never stores what it does not understand", async () => {
    const c = cookies(
      await post([
        ["kinds", "nonsense"],
        ["city", "atlantis"],
        ["tags", "made-up"],
      ]),
    );
    expect(decodePreferences(c.prefs?.value)).toEqual({ v: 1, kinds: [], tags: [] });
    expect(c.city?.value).toBe("");
  });

  it("only sends the reader to a path on this site", async () => {
    const to = async (next: string) =>
      (
        await post([
          ["kinds", "job"],
          ["next", next],
        ])
      ).headers.get("location");
    expect(await to("/opportunities?kinds=job")).toBe(
      "https://devspot.test/opportunities?kinds=job",
    );
    expect(await to("https://evil.example/")).toBe("https://devspot.test/feed");
    expect(await to("//evil.example/")).toBe("https://devspot.test/feed");
  });

  it("refuses a form sent from another site, and sets nothing", async () => {
    const res = await post([["kinds", "job"]], { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie()).toEqual([]);
    const own = await post([["kinds", "job"]], { origin: "https://devspot.test" });
    expect(own.status).toBe(303);
  });
});
