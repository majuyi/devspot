// @vitest-environment jsdom
import { encodePreferences, type Preferences } from "@devspot/schema";
import axe from "axe-core";
import type { ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, text } from "../components/render";
import { hasDb, NOW, seedHome } from "../seed";

// The page reads the request's cookies; here a test sets them.
let cookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "prefs" && cookie ? { name, value: cookie } : undefined),
  }),
}));

type FeedModule = typeof import("../../src/app/feed/page");

async function violations(el: HTMLElement): Promise<string[]> {
  document.documentElement.lang = "en-GB";
  document.title = "My feed";
  document.body.replaceChildren(el);
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}
const rowSlugs = (el: Element) =>
  [...el.querySelectorAll('a[href^="/o/"]')]
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => !h.endsWith(".ics"))
    .map((h) => h.slice(3));
const link = (el: Element, label: string) =>
  [...el.querySelectorAll("a")].find((a) => text(a).startsWith(label))?.getAttribute("href");
const bands = (el: Element) => [...el.querySelectorAll("[data-band]")].map(text);

describe.skipIf(!hasDb)("/feed (docs/01 §2 and §3)", () => {
  let Feed: FeedModule["default"];
  const feed = async (query = "", saved?: Preferences) => {
    cookie = saved ? encodePreferences(saved) : undefined;
    return render(
      (await Feed({
        searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(query))),
      })) as ReactElement,
    );
  };
  const LAGOS_JOBS: Preferences = { v: 1, kinds: ["job"], city: "lagos", tags: [] };

  beforeAll(async () => {
    const { db } = await import("@devspot/db");
    await seedHome(db);
    Feed = (await import("../../src/app/feed/page")).default;
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("with nothing saved and nothing in the URL: the form, posting to /api/prefs", async () => {
    const el = await feed();
    expect(text(el.querySelector("h1") as Element)).toBe("Set up my feed");
    const form = el.querySelector("form") as HTMLFormElement;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.getAttribute("action")).toBe("/api/prefs");
    expect(form.querySelectorAll('input[name="kinds"]')).toHaveLength(11);
    expect(form.querySelectorAll('input[name="tags"]')).toHaveLength(16);
    expect(form.querySelectorAll("select[name=city] option")).toHaveLength(17);
    expect(form.querySelectorAll("input:checked")).toHaveLength(0);
    // Nothing to clear yet.
    expect(form.querySelector('button[name="clear"]')).toBeNull();
    expect(rowSlugs(el)).toEqual([]);
    expect(await violations(el)).toEqual([]);
  });

  it("acceptance: ?city=lagos&kinds=event shows only Lagos, nationwide or remote events", async () => {
    const el = await feed("city=lagos&kinds=event");
    expect(text(el.querySelector("h1") as Element)).toBe("A shared feed");
    expect(text(el)).toContain("Events · Lagos, nationwide and remote");
    expect(new Set(rowSlugs(el))).toEqual(new Set(["ev-today", "ev-ongoing", "ev-deadline"]));
    for (const s of ["ev-a", "ev-b", "ev-c", "ev-d", "today", "lagos-job"]) {
      expect(rowSlugs(el)).not.toContain(s);
    }
  });

  it("the saved feed: summary, Edit, the two parts in order", async () => {
    const el = await feed("", { v: 1, kinds: ["job", "hackathon"], tags: [] });
    expect(text(el.querySelector("h1") as Element)).toBe("My feed");
    expect(text(el)).toContain("Jobs, Hackathons · All of Nigeria and remote");
    expect(link(el, "Edit")).toBe("/feed?edit=1");
    expect(bands(el)).toEqual([
      "Closing in the next 14 dayssoonest first",
      "Everything elsenewest first",
    ]);
    // Deadlines in the next 14 days, soonest first, then the rest.
    expect(rowSlugs(el).slice(0, 4)).toEqual(["today", "tomorrow", "multi", "lagos-hybrid"]);
    expect(rowSlugs(el)).toContain("lagos-job");
    expect(rowSlugs(el)).not.toContain("ev-a");
    // A saved feed is not offered to itself.
    expect(text(el)).not.toContain("Save as my feed");
    expect(await violations(el)).toEqual([]);
  });

  it("the URL is the whole feed for that visit, not a mix with the saved one", async () => {
    const el = await feed("kinds=event", LAGOS_JOBS);
    // Saved: jobs in Lagos. The URL says events and no city, so Ibadan's events show.
    expect(rowSlugs(el)).toContain("ev-a");
    expect(rowSlugs(el)).not.toContain("lagos-job");
    expect(link(el, "Back to my feed")).toBe("/feed");
    const save = [...el.querySelectorAll("form")].find((f) => text(f).includes("Save as my feed"));
    if (!save) throw new Error("no save form");
    const field = (name: string) => save.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value;
    expect(field("kinds")).toBe("event");
    expect(field("city")).toBe("");
    expect(text(save)).toContain("Replaces the feed saved on this device.");
  });

  it("share: the query-string address, as text and as a WhatsApp link", async () => {
    const el = await feed("", LAGOS_JOBS);
    const share = el.querySelector("#share") as Element;
    expect(text(share.querySelector("code") as Element)).toBe(
      "https://devspot.test/feed?kinds=job&city=lagos",
    );
    expect(link(share, "Share on WhatsApp")).toContain(
      encodeURIComponent("https://devspot.test/feed?kinds=job&city=lagos"),
    );
    // A feed of everything has no address of its own to share.
    expect((await feed("", { v: 1, kinds: [], tags: [] })).querySelector("#share")).toBeNull();
  });

  it("edit: the form with the saved choices ticked, and Clear", async () => {
    const el = await feed("edit=1", {
      v: 1,
      kinds: ["job"],
      city: "lagos",
      tags: ["ml"],
      remoteOnly: true,
    });
    expect(text(el.querySelector("h1") as Element)).toBe("Edit my feed");
    const checked = [...el.querySelectorAll("input:checked")].map(
      (i) => `${i.getAttribute("name")}=${i.getAttribute("value")}`,
    );
    expect(checked).toEqual(["kinds=job", "remote=1", "tags=ml"]);
    expect(el.querySelector("select option[selected]")?.getAttribute("value")).toBe("lagos");
    expect(el.querySelector('button[name="clear"]')).not.toBeNull();
  });

  it("pages with links, and an empty feed explains itself", async () => {
    const first = await feed("", { v: 1, kinds: [], tags: [] });
    expect(rowSlugs(first)).toHaveLength(30);
    const next = link(first, "Next page");
    expect(next).toMatch(/^\/feed\?cursor=/);
    const second = await feed((next ?? "").split("?")[1], { v: 1, kinds: [], tags: [] });
    expect(rowSlugs(second).filter((s) => rowSlugs(first).includes(s))).toEqual([]);
    expect(link(second, "Back to the first page")).toBe("/feed");

    const empty = await feed("kinds=grant&city=kano");
    expect(text(empty.querySelector("h2") as Element)).toBe(
      "Nothing open matches this feed right now",
    );
    expect(link(empty, "Widen the feed")).toBe("/feed?kinds=grant&city=kano&edit=1");
    expect(await violations(empty)).toEqual([]);
  });
});
