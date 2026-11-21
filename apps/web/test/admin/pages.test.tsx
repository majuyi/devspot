// @vitest-environment jsdom
import type { PrismaClient } from "@devspot/db";
import { identityKey } from "@devspot/schema";
import axe from "axe-core";
import type { ReactElement } from "react";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { ADMIN_COOKIE, newSession } from "../../src/admin/auth";
import { render, text } from "../components/render";
import { at, hasDb, opp, org, reset } from "../seed";

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
let session: string | undefined;
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === ADMIN_COOKIE && session ? { name, value: session } : undefined,
  }),
  headers: async () => ({ get: () => null }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const adminUrl = inject("adminDatabaseUrl");

async function violations(el: HTMLElement): Promise<string[]> {
  document.documentElement.lang = "en-GB";
  document.title = "Admin";
  document.body.replaceChildren(el);
  const result = await axe.run(document, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
}

describe.skipIf(!hasDb || !adminUrl)("admin pages", () => {
  let su: PrismaClient;
  let Queue: typeof import("../../src/app/admin/page")["default"];
  let Item: typeof import("../../src/app/admin/o/[id]/page")["default"];
  let Login: typeof import("../../src/app/admin/login/page")["default"];
  let New: typeof import("../../src/app/admin/new/page")["default"];
  const newPage = async (query = "") =>
    render(
      (await New({
        searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(query))),
      })) as ReactElement,
    );
  const ids: Record<string, string> = {};
  const queue = async (query = "") =>
    render(
      (await Queue({
        searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(query))),
      })) as ReactElement,
    );
  const item = async (slug: string, query = "") =>
    render(
      (await Item({
        params: Promise.resolve({ id: ids[slug] as string }),
        searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(query))),
      })) as ReactElement,
    );
  const titles = (el: Element) => [...el.querySelectorAll("tbody th")].map(text);
  const make = async (organizationId: string, slug: string, extra: object = {}) => {
    ids[slug] = (await opp(su, { organizationId, slug, title: `Title ${slug}`, ...extra })).id;
  };

  beforeAll(async () => {
    process.env.ADMIN_TOKEN = "t".repeat(40);
    process.env.ADMIN_DATABASE_URL = adminUrl ?? "";
    ({ db: su } = await import("@devspot/db"));
    await reset(su);
    const acme = await org(su, { slug: "acme", name: "Acme" });
    const kuda = await org(su, { slug: "kuda", name: "Kuda" });
    const source = await su.source.create({
      data: {
        organizationId: acme.id,
        key: "acme/site",
        kind: "html",
        url: "https://acme.example",
      },
    });
    const raw = await su.rawItem.create({
      data: {
        sourceId: source.id,
        canonicalUrl: "https://example.org/unsure",
        contentHash: "h",
        text: "Apply by 5 November 2026. The role is hybrid in Lagos.",
      },
    });
    await make(acme.id, "unsure", {
      status: "review",
      confidence: 0.3,
      kind: null,
      rawItemId: raw.id,
      // As the loader computes it, so /admin/new can find it as a likely duplicate.
      identityKey: identityKey("acme", { title: "Title unsure" }, new Date()),
      fieldConfidence: { kind: 0.2, deadlineAt: 0.9 },
      deadlineAt: new Date("2026-11-05T22:59:00Z"),
      // The engine's evidence: the deadline was read from the text; the location was not.
      extracted: { evidence: [{ field: "deadline", quote: "5 November 2026" }] },
    });
    await make(acme.id, "surer", { status: "review", confidence: 0.8 });
    await make(kuda.id, "live", { status: "published", kind: "job", publishedAt: at(-24) });
    await make(kuda.id, "gone", { status: "rejected", statusReason: "spam" });
    await su.opportunityEvent.create({
      data: {
        opportunityId: ids.live as string,
        actor: "admin",
        action: "published",
        changes: { status: { from: "review", to: "published" } },
        note: "looks right",
      },
    });
    Queue = (await import("../../src/app/admin/page")).default;
    Item = (await import("../../src/app/admin/o/[id]/page")).default;
    Login = (await import("../../src/app/admin/login/page")).default;
    New = (await import("../../src/app/admin/new/page")).default;
  });
  afterAll(() => {
    delete process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_DATABASE_URL;
  });

  it("signed out, the queue and an item send to the login form", async () => {
    session = undefined;
    await expect(queue()).rejects.toMatchObject({ to: "/admin/login" });
    await expect(item("live")).rejects.toMatchObject({ to: "/admin/login" });
    const login = render(
      (await Login({ searchParams: Promise.resolve({ error: "wrong" }) })) as ReactElement,
    );
    expect(text(login.querySelector('[role="alert"]') as Element)).toBe("That token is not right.");
    expect(login.querySelector('input[type="password"][name="token"]')).not.toBeNull();
  });

  describe("signed in", () => {
    beforeAll(() => {
      session = newSession() as string;
    });

    it("the review tab lists items in review, least sure first", async () => {
      const el = await queue();
      expect(titles(el)).toEqual(["Title unsure", "Title surer"]);
      expect(text(el.querySelector('nav [aria-current="page"]') as Element)).toBe("In review2");
      expect(text(el)).toContain("2 items, least sure first");
      expect(await violations(el)).toEqual([]);
    });

    it("the All tab finds any item by title, organisation or status, and links carry the view", async () => {
      expect(titles(await queue("tab=all")).sort()).toEqual([
        "Title gone",
        "Title live",
        "Title surer",
        "Title unsure",
      ]);
      expect(titles(await queue("tab=all&q=kuda")).sort()).toEqual(["Title gone", "Title live"]);
      expect(titles(await queue("tab=all&q=LIVE"))).toEqual(["Title live"]);
      const el = await queue("tab=all&status=published&org=kuda");
      expect(titles(el)).toEqual(["Title live"]);
      expect(el.querySelector("tbody a")?.getAttribute("href")).toBe(
        `/admin/o/${ids.live}?back=${encodeURIComponent("/admin?tab=all&status=published&org=kuda")}`,
      );
      expect(await violations(el)).toEqual([]);
    });

    it("an item in review: source text with marks, field confidence, and the review actions", async () => {
      const el = await item("unsure", "back=/admin?tab=all");
      expect([...el.querySelectorAll("mark")].map(text)).toEqual([
        "words a field was read from",
        "dates",
        "place words",
        "5 November 2026",
        "hybrid",
        "Lagos",
      ]);
      // The evidence quote names its field, and the form says where each value came from.
      expect(text(el)).toContain("5 November 2026 (deadline)");
      expect(text(el)).toContain("From the text: “5 November 2026”");
      expect(text(el)).toContain("Not found in the source text. Check it against the page.");
      expect(
        [...el.querySelectorAll("select#reason option")].map((o) => o.getAttribute("value")),
      ).toEqual(["", "not-an-opportunity", "other"]);
      expect(text(el)).toContain("Kindsure 0.20");
      expect(
        [...el.querySelectorAll("button[name=intent]")].map((b) => [
          b.getAttribute("value"),
          text(b),
        ]),
      ).toEqual([
        ["publish", "Publish"],
        ["publishNext", "Publish and next"],
        ["save", "Save without publishing"],
        ["reject", "Reject"],
      ]);
      // Saving a draft and rejecting must not demand the fields publishing needs.
      expect(el.querySelector('button[value="save"]')?.hasAttribute("formnovalidate")).toBe(true);
      expect(el.querySelector('button[value="publish"]')?.hasAttribute("formnovalidate")).toBe(
        false,
      );
      expect((el.querySelector('input[name="back"]') as HTMLInputElement).value).toBe(
        "/admin?tab=all",
      );
      expect(el.querySelector('a[href^="/o/"]')).toBeNull();
      expect(await violations(el)).toEqual([]);
    });

    it("a copy the engine flagged: says so, and offers merge and split", async () => {
      // Made here, not in beforeAll, so the queue counts other tests check stay as they are.
      const acme = await su.organization.findUniqueOrThrow({ where: { slug: "acme" } });
      await make(acme.id, "copy", { status: "review", duplicateOfId: ids.surer });
      const el = await item("copy").finally(() =>
        su.opportunity.delete({ where: { id: ids.copy as string } }),
      );
      expect(text(el)).toContain("Looks like a copy of Title surer");
      const buttons = [...el.querySelectorAll("button")].map(text);
      expect(buttons).toContain("Merge: the same opportunity");
      expect(buttons).toContain("Split: a different one");
      expect((el.querySelector('input[name="originalId"]') as HTMLInputElement | null)?.value).toBe(
        ids.surer,
      );
      expect(await violations(el)).toEqual([]);
    });

    it("a published item: Save changes and Unpublish, View on site, and its history", async () => {
      const el = await item("live");
      expect([...el.querySelectorAll("button[name=intent]")].map(text)).toEqual([
        "Save changes",
        "Unpublish",
      ]);
      expect(el.querySelector('a[href="/o/live"]')).not.toBeNull();
      expect(text(el)).toContain("Published by admin");
      expect(text(el)).toContain("“looks right”");
      expect(text(el)).toContain("No source text is stored for this item.");
    });

    it("explains when the source now states a different deadline", async () => {
      await su.opportunity.update({
        where: { id: ids.live },
        data: { sourceDeadlineAt: new Date("2026-12-10T22:59:00.000Z") },
      });
      try {
        const el = await item("live");
        expect(text(el.querySelector('[role="status"]') as Element)).toContain(
          "The source page now states the deadline as Thu 10 Dec 2026.",
        );
        expect(text(await queue())).toContain("source deadline changed");
      } finally {
        await su.opportunity.update({ where: { id: ids.live }, data: { sourceDeadlineAt: null } });
      }
    });

    it("shows an error or a saved note from the URL, and a rejected item's reason", async () => {
      expect(
        text(
          (await item("unsure", "error=Kind: choose one")).querySelector(
            '[role="alert"]',
          ) as Element,
        ),
      ).toBe("Not saved. Kind: choose one");
      expect(
        text((await item("unsure", "saved=1")).querySelector('[role="status"]') as Element),
      ).toBe("Saved.");
      expect(text(await item("gone"))).toContain("Reason on record: spam");
    });

    it("the tabs follow the spec's order, with counts", async () => {
      const el = await queue("tab=duplicates");
      expect([...el.querySelectorAll('nav[aria-label="Queues"] a')].map(text)).toEqual([
        "In review2",
        "Submissions0",
        "Duplicates0",
        "Sources erroring0",
        "All4",
      ]);
      expect(text(el)).toContain("No two live items share an identity key.");
      expect(text(await queue("tab=sources"))).toContain("No source is erroring or stale.");
      expect(await violations(el)).toEqual([]);
    });

    it("an item offers Mark duplicate of, and the search lists candidates with a button each", async () => {
      const el = await item("surer", "dupq=title");
      const section = el.querySelector('section[aria-labelledby="duplicate"]') as Element;
      expect(section.querySelector('form[method="get"] input[name="dupq"]')).not.toBeNull();
      const found = [...section.querySelectorAll("li")].map((li) =>
        text(li.querySelector("span") as Element),
      );
      expect(found.length).toBeGreaterThan(0);
      expect(found.join(" ")).not.toContain("Title surer");
      expect(found.join(" ")).not.toContain("Title gone");
      expect(text(section.querySelector("li button") as Element)).toMatch(
        /^Mark as copy of Title /,
      );
      expect(await violations(el)).toEqual([]);
    });

    it("/admin/new step one: organisation, address, title; a known address is blocked", async () => {
      const blank = await newPage();
      expect(text(blank.querySelector("h1") as Element)).toBe("New opportunity");
      const step1 = blank.querySelector('form[method="get"]') as Element;
      expect([...step1.querySelectorAll("[name]")].map((e) => e.getAttribute("name"))).toEqual([
        "org",
        "url",
        "title",
      ]);
      expect(blank.querySelector('button[name="intent"]')).toBeNull();
      expect(await violations(blank)).toEqual([]);

      const taken = await newPage("org=kuda&url=https://example.org/live&title=Anything");
      expect(text(taken)).toContain("This page is already listed.");
      expect(taken.querySelector('a[href^="/admin/o/"]')?.getAttribute("href")).toBe(
        `/admin/o/${ids.live}?back=%2Fadmin`,
      );
      expect(taken.querySelector('button[name="intent"]')).toBeNull();
      expect(text(taken)).not.toContain("This is a different opportunity");
    });

    it("/admin/new: a likely duplicate is shown first, and can be confirmed as different", async () => {
      const q = "org=acme&url=https://acme.example/new&title=Title unsure";
      const similar = await newPage(q);
      expect(text(similar)).toContain("This looks like an opportunity already listed");
      expect(similar.querySelector('button[name="intent"]')).toBeNull();
      const confirm = [...similar.querySelectorAll("a")].find((a) =>
        text(a).startsWith("This is a different"),
      );
      expect(confirm?.getAttribute("href")).toContain("confirm=1");
      const step2 = await newPage(`${q}&confirm=1`);
      expect([...step2.querySelectorAll("button[name=intent]")].map(text)).toEqual([
        "Publish",
        "Save without publishing",
      ]);
      expect((step2.querySelector('input[name="title"]') as HTMLInputElement).value).toBe(
        "Title unsure",
      );
      expect((step2.querySelector('input[name="canonicalUrl"]') as HTMLInputElement).value).toBe(
        "https://acme.example/new",
      );
      expect(await violations(step2)).toEqual([]);
    });

    it("/admin/new: a new page and title go straight to step two; bad input is explained", async () => {
      const step2 = await newPage(
        "org=kuda&url=https://kuda.com/careers/new-role&title=Brand New Role",
      );
      expect(step2.querySelector('button[value="publish"]')).not.toBeNull();
      expect(text(step2)).toContain("Kuda");
      expect(text(await newPage("org=kuda&url=nope&title=X"))).toContain(
        "The page address must be a web address",
      );
      expect(text(await newPage("org=nobody&url=https://x.example&title=X"))).toContain(
        "Choose an organisation",
      );
    });
  });
});
