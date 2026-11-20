// @vitest-environment jsdom
import { ERRORING_AFTER, NEW_UNDER_RUNS, sourceHealth } from "@devspot/schema";
import axe from "axe-core";
import type { ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, text } from "../components/render";
import { at, hasDb, NOW, opp, org, reset } from "../seed";

/** Runs enough for a source to be past "new", so its other states show. */
const PAST_NEW = NEW_UNDER_RUNS + 1;

type StatusModule = typeof import("../../src/app/status/page");

async function violations(el: HTMLElement): Promise<string[]> {
  document.documentElement.lang = "en-GB";
  document.title = "Status";
  document.body.replaceChildren(el);
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

describe.skipIf(!hasDb)("/status (docs/01 §3)", () => {
  let Status: StatusModule["default"];
  const page = async () => render((await Status()) as ReactElement);
  let db: typeof import("@devspot/db")["db"];

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    await reset(db);
    const source = async (slug: string, name: string, runs: number, extra: object = {}) => {
      const o = await org(db, { slug, name });
      const s = await db.source.create({
        data: {
          organizationId: o.id,
          key: `${slug}/site`,
          kind: "html",
          url: `https://www.${slug}.example/jobs`,
          ...extra,
        },
      });
      for (let i = 0; i < runs; i++) {
        await db.fetchRun.create({
          data: { sourceId: s.id, ok: true, startedAt: at(-3 - i * 6), finishedAt: at(-2 - i * 6) },
        });
      }
      return o;
    };
    const kuda = await source("kuda", "Kuda", PAST_NEW, { lastOkAt: at(-2), lastYieldAt: at(-50) });
    await source("paga", "Paga", PAST_NEW, { lastOkAt: at(-9), consecutiveEmpty: 2 });
    await source("zindi", "Zindi", PAST_NEW, { lastOkAt: at(-30) });
    await source("devpost", "Devpost", PAST_NEW, {
      lastOkAt: at(-3),
      consecutiveErrors: ERRORING_AFTER,
    });
    await source("gdg", "GDG", 0);
    await source("old", "Old Org", PAST_NEW, { enabled: false, lastOkAt: at(-1) });
    await source("byhand", "By Hand", 0, { kind: "manual" });
    await opp(db, { organizationId: kuda.id, slug: "a", title: "A", publishedAt: at(-24) });
    await opp(db, { organizationId: kuda.id, slug: "b", title: "B", publishedAt: at(-400) });
    Status = (await import("../../src/app/status/page")).default;
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("the top: the date, how many need attention, and the three counts", async () => {
    const el = await page();
    expect(text(el.querySelector("h1") as Element)).toBe("3 sources need attention");
    expect(text(el)).toContain("Wed 4 Nov 2026 · WAT");
    expect(text(el)).toContain(
      "1 of 4 sources read in the last 8 hours. Listings from the other 3 may be out of date.",
    );
    expect(text(el)).toContain("1On time1Late2Failing");
  });

  it("the reader's list: worst first, each with its site and last read; disabled left out", async () => {
    const el = await page();
    const rows = [
      ...(el.querySelector('section[aria-labelledby="sources"]') as Element).querySelectorAll(
        ".flex.items-center.justify-between",
      ),
    ].map(text);
    expect(rows).toEqual([
      "Devpostdevpost.example · last read 3h agoFailing",
      "Zindizindi.example · last read 1d agoFailing",
      "Pagapaga.example · last read 9h agoLate",
      "GDGgdg.example · not read yetNew",
      "Kudakuda.example · read 2h agoOn time",
    ]);
    expect(text(el.querySelector('section[aria-labelledby="sources"]') as Element)).toContain(
      "5 in total",
    );
  });

  it("the contributor table carries the engine's own state for every source, worst first", async () => {
    const el = await page();
    const rows = [...el.querySelectorAll("table tbody tr")].map((tr) => [...tr.children].map(text));
    expect(rows).toEqual([
      ["Devpost", "devpost/site", "Web page", "3h ago", "never", "0", "Erroring"],
      ["By Hand", "byhand/site", "Entered by hand", "never", "never", "0", "New"],
      ["GDG", "gdg/site", "Web page", "never", "never", "0", "New"],
      ["Kuda", "kuda/site", "Web page", "2h ago", "2d ago", "0", "Healthy"],
      ["Paga", "paga/site", "Web page", "9h ago", "never", "2", "Healthy"],
      ["Zindi", "zindi/site", "Web page", "1d ago", "never", "0", "Healthy"],
      ["Old Org", "old/site", "Web page", "1h ago", "never", "0", "Disabled"],
    ]);
    // The state column is the function `engine health` uses, applied to the same rows.
    const stored = await db.source.findMany({
      include: { organization: true, _count: { select: { fetchRuns: true } } },
    });
    for (const s of stored) {
      const state = sourceHealth(
        { ...s, enabled: s.enabled && s.organization.enabled },
        s._count.fetchRuns,
      );
      const row = rows.find((r) => r[1] === s.key);
      expect(row?.[6]?.toLowerCase()).toBe(state);
    }
    expect(el.querySelector('table a[href$="registry/organizations/kuda.yaml"]')).not.toBeNull();
  });

  it("how this works: the rules in words, the counts, and when the engine last ran", async () => {
    const how = (await page()).querySelector('section[aria-labelledby="how"]') as Element;
    expect(text(how)).toContain("late after 8 hours without a good read, and failing after 24");
    expect(text(how)).toContain("Organisations7");
    expect(text(how)).toContain("Sources6");
    expect(text(how)).toContain("Open opportunities2");
    expect(text(how)).toContain("Published this week1");
    expect(text(how)).toContain("Engine last ran2h ago");
    expect(
      how.querySelector('a[href="https://github.com/majuyi/devspot/issues/new"]'),
    ).not.toBeNull();
  });

  it("has one h1 and no axe violations", async () => {
    const el = await page();
    expect(el.querySelectorAll("h1")).toHaveLength(1);
    expect(await violations(el)).toEqual([]);
  });

  it("all read on time: normal operations", async () => {
    await db.source.updateMany({ data: { lastOkAt: at(-1), consecutiveErrors: 0 } });
    await db.source.update({ where: { key: "gdg/site" }, data: { lastOkAt: null } });
    await db.source.update({ where: { key: "byhand/site" }, data: { lastOkAt: null } });
    const el = await page();
    expect(text(el.querySelector("h1") as Element)).toBe("Normal operations");
    expect(text(el)).toContain("All 4 sources read in the last 8 hours.");
    expect(text(el)).toContain("4On time0Late0Failing");
  });
});
