// @vitest-environment jsdom
import axe from "axe-core";
import type { ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, text } from "../components/render";
import { at, hasDb, NOW, opp, org, reset } from "../seed";

type Index = typeof import("../../src/app/org/page");
type Detail = typeof import("../../src/app/org/[slug]/page");

async function violations(el: HTMLElement, title: string): Promise<string[]> {
  document.documentElement.lang = "en-GB";
  document.title = title;
  document.body.replaceChildren(el);
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

const rowSlugs = (el: Element) =>
  [...el.querySelectorAll('a[href^="/o/"]')]
    .map((a) => a.getAttribute("href") ?? "")
    .filter((h) => !h.endsWith(".ics"))
    .map((h) => h.slice(3));
const section = (el: Element, id: string) =>
  el.querySelector(`section[aria-labelledby="${id}"]`) as Element;
const link = (el: Element, label: string) =>
  [...el.querySelectorAll("a")].find((a) => text(a).startsWith(label))?.getAttribute("href");

describe.skipIf(!hasDb)("organisation pages", () => {
  let index: Index;
  let detail: Detail;
  const page = async (slug: string) =>
    render((await detail.default({ params: Promise.resolve({ slug }) })) as ReactElement);

  beforeAll(async () => {
    const { db } = await import("@devspot/db");
    await reset(db);
    const kuda = await org(db, {
      slug: "kuda",
      name: "Kuda",
      city: "lagos",
      description: "A bank for Africans.\n",
      homepageUrl: "https://www.kuda.com",
    });
    const devpost = await org(db, {
      slug: "devpost",
      name: "Devpost",
      category: "hackathonHost",
      country: "US",
    });
    await org(db, {
      slug: "gdg-ilorin",
      name: "GDG Ilorin",
      category: "community",
      city: "ilorin",
    });
    await org(db, { slug: "paga", name: "Paga", city: "lagos" });
    const gone = await org(db, { slug: "gone", name: "Gone", enabled: false });
    const source = async (
      organizationId: string,
      key: string,
      runs: number,
      extra: object = {},
    ) => {
      const s = await db.source.create({
        data: {
          organizationId,
          key,
          kind: "html",
          url: `https://www.${key}.example/careers`,
          ...extra,
        },
      });
      for (let i = 0; i < runs; i++) {
        await db.fetchRun.create({
          data: { sourceId: s.id, ok: true, startedAt: at(-10 - i), finishedAt: at(-9 - i) },
        });
      }
    };
    await source(kuda.id, "kuda-careers", 5, { lastOkAt: at(-3) });
    await source(devpost.id, "devpost-api", 5, { kind: "api", lastOkAt: at(-2) });
    await source(devpost.id, "devpost-feed", 5, { kind: "feed", consecutiveErrors: 3 });
    await source(gone.id, "gone-site", 5);

    const o = (organizationId: string, slug: string, extra: object = {}) =>
      opp(db, { organizationId, slug, title: `Title ${slug}`, kind: "job", ...extra });
    await o(kuda.id, "kuda-soon", { deadlineAt: at(20) });
    await o(kuda.id, "kuda-undated");
    await o(kuda.id, "kuda-review", { status: "review" });
    for (let i = 1; i <= 11; i++) {
      await o(kuda.id, `kuda-old-${String(i).padStart(2, "0")}`, {
        status: "closed",
        deadlineAt: at(-100 - i * 24),
        closedAt: at(-90 - i * 24),
      });
    }
    await o(devpost.id, "devpost-hack", { kind: "hackathon", deadlineAt: at(200) });

    index = await import("../../src/app/org/page");
    detail = await import("../../src/app/org/[slug]/page");
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it("index: enabled organisations by category, open count and worst-source health", async () => {
    const el = render((await index.default()) as ReactElement);
    expect(text(el.querySelector("h1") as Element)).toBe("Organisations");
    expect(text(el)).toContain("4 organisations.");
    expect([...el.querySelectorAll("[data-band]")].map(text)).toEqual([
      "Employers2",
      "Communities1",
      "Hackathon hosts1",
    ]);
    const rows = [...el.querySelectorAll('a[href^="/org/"]')].map((a) => [
      a.getAttribute("href"),
      text(a),
    ]);
    expect(rows).toEqual([
      ["/org/kuda", "KKudaLagos2 openHealthy"],
      ["/org/paga", "PPagaLagos0 openNew"],
      ["/org/gdg-ilorin", "GGDG IlorinIlorin0 openNew"],
      ["/org/devpost", "DDevpostUS1 openErroring"],
    ]);
    expect(text(el)).not.toContain("Gone");
    expect(await violations(el, "Organisations")).toEqual([]);
  });

  it("detail: who they are, what is open, the last ten closed, and the rest on browse", async () => {
    const el = await page("kuda");
    expect(text(el.querySelector("h1") as Element)).toBe("Kuda");
    expect(text(el)).toContain("Employer · Lagos");
    expect(text(el)).toContain("A bank for Africans.");
    expect(link(el, "kuda.com")).toBe("https://www.kuda.com");
    expect(link(el, "Organisations")).toBe("/org");

    const open = section(el, "open-now");
    expect(rowSlugs(open)).toEqual(["kuda-soon", "kuda-undated"]);
    expect(link(open, "All 2 open")).toBe("/opportunities?org=kuda");
    expect(text(open)).not.toContain("more open");

    const past = section(el, "past");
    expect(rowSlugs(past)).toHaveLength(10);
    expect(rowSlugs(past)[0]).toBe("kuda-old-01");
    expect(rowSlugs(past)).not.toContain("kuda-old-11");
    expect(link(past, "Everything from Kuda")).toBe("/opportunities?org=kuda&status=all");
    expect(rowSlugs(el)).not.toContain("kuda-review");
    expect(await violations(el, "Kuda")).toEqual([]);
  });

  it("detail: each source with how it is read, when, its health, and the registry link", async () => {
    const el = await page("devpost");
    const items = [...section(el, "tracking").querySelectorAll("li")].map(text);
    expect(items).toEqual([
      "APIHealthydevpost-api.example/careersLast read 2h ago",
      "FeedErroringdevpost-feed.example/careersNot read yet",
    ]);
    expect(text(el)).toContain("Hackathon host · US");
    expect(link(el, "Improve this entry")).toBe(
      "https://github.com/majuyi/devspot/blob/main/registry/organizations/devpost.yaml",
    );
    expect(section(el, "past")).toBeNull();
  });

  it("detail: nothing open and no source still explains itself", async () => {
    const el = await page("paga");
    expect(text(section(el, "open-now"))).toContain("Nothing from Paga is open right now.");
    expect(text(section(el, "tracking"))).toContain("No source is set up");
    expect(await violations(el, "Paga")).toEqual([]);
  });

  it("a disabled or unknown organisation is not found", async () => {
    await expect(page("gone")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    await expect(page("nobody")).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    const meta = await detail.generateMetadata({ params: Promise.resolve({ slug: "kuda" }) });
    expect(meta).toMatchObject({ title: "Kuda", description: "A bank for Africans." });
  });
});
