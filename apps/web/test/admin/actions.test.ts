import type { PrismaClient } from "@devspot/db";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from "vitest";
import { ADMIN_COOKIE, newSession, sessionValid } from "../../src/admin/auth";
import { at, hasDb, opp, org, reset } from "../seed";

// Next's request scope, stood in for by plain objects the tests control.
class Redirect extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}
const jar = new Map<string, string>();
const requestHeaders = new Map<string, string>();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
  headers: async () => ({ get: (name: string) => requestHeaders.get(name) ?? null }),
}));
const revalidated: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: (p: string) => void revalidated.push(p) }));

type Actions = typeof import("../../src/admin/actions");

const adminUrl = inject("adminDatabaseUrl");
const webUrl = inject("webDatabaseUrl");
const TOKEN = "t".repeat(40);

const form = (fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) for (const x of [v].flat()) f.append(k, x);
  return f;
};
/** Runs an action and returns where it redirected to. */
async function run(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (e) {
    if (e instanceof Redirect) return e.to;
    throw e;
  }
  throw new Error("the action did not redirect");
}

describe.skipIf(!hasDb || !adminUrl)(
  "admin actions, connected as the admin role (ADR 0016)",
  () => {
    let su: PrismaClient;
    let actions: Actions;
    let orgId: string;
    const ids: Record<string, string> = {};
    const signIn = () => jar.set(ADMIN_COOKIE, newSession() as string);
    const row = (slug: string) => su.opportunity.findUniqueOrThrow({ where: { slug } });
    const events = (slug: string) =>
      su.opportunityEvent.findMany({ where: { opportunityId: ids[slug] }, orderBy: { at: "asc" } });
    const fields = (slug: string, over: Record<string, string | string[]> = {}) => ({
      id: ids[slug] as string,
      back: "/admin?tab=all&q=acme",
      title: `Title ${slug}`,
      kind: "job",
      locationMode: "remote",
      deadlineKind: "unknown",
      ...over,
    });

    beforeAll(async () => {
      process.env.ADMIN_TOKEN = TOKEN;
      process.env.ADMIN_DATABASE_URL = adminUrl ?? "";
      ({ db: su } = await import("@devspot/db"));
      actions = await import("../../src/admin/actions");
    });
    afterAll(() => {
      delete process.env.ADMIN_TOKEN;
      delete process.env.ADMIN_DATABASE_URL;
    });
    beforeEach(async () => {
      jar.clear();
      requestHeaders.clear();
      revalidated.length = 0;
      await reset(su);
      orgId = (await org(su, { slug: "acme", name: "Acme" })).id;
      const make = async (slug: string, extra: object = {}) => {
        const o = await opp(su, { organizationId: orgId, slug, title: `Title ${slug}`, ...extra });
        ids[slug] = o.id;
      };
      await make("draft", { status: "review", kind: null, locationMode: null, confidence: 0.4 });
      await make("ready", { status: "review", kind: "job", confidence: 0.6 });
      await make("live", {
        status: "published",
        kind: "job",
        publishedAt: at(-48),
        reviewedAt: at(-48),
      });
    });

    describe("signed out", () => {
      it("every action goes to the login form and changes nothing", async () => {
        expect(
          await run(actions.saveOpportunity(form({ ...fields("ready"), intent: "publish" }))),
        ).toBe("/admin/login");
        jar.set(ADMIN_COOKIE, "9999999999999.forged");
        expect(
          await run(actions.saveOpportunity(form({ ...fields("live"), intent: "unpublish" }))),
        ).toBe("/admin/login");
        expect((await row("ready")).status).toBe("review");
        expect((await row("live")).status).toBe("published");
        expect(await su.opportunityEvent.count()).toBe(0);
      });
    });

    describe("login", () => {
      it("the right token sets a valid session cookie and opens the queue", async () => {
        requestHeaders.set("x-forwarded-for", "10.0.0.1");
        expect(await run(actions.login(form({ token: TOKEN })))).toBe("/admin");
        expect(sessionValid(jar.get(ADMIN_COOKIE))).toBe(true);
      });

      it("a wrong token sets nothing; the sixth try in a minute is told to wait", async () => {
        requestHeaders.set("x-forwarded-for", "10.0.0.2");
        for (let i = 0; i < 5; i++) {
          expect(await run(actions.login(form({ token: "wrong" })))).toBe(
            "/admin/login?error=wrong",
          );
        }
        expect(jar.has(ADMIN_COOKIE)).toBe(false);
        // Even the right token waits once the limit is hit.
        expect(await run(actions.login(form({ token: TOKEN })))).toBe("/admin/login?error=wait");
        expect(jar.has(ADMIN_COOKIE)).toBe(false);
      });

      it("log out removes the cookie", async () => {
        signIn();
        expect(await run(actions.logout())).toBe("/admin/login");
        expect(jar.has(ADMIN_COOKIE)).toBe(false);
      });
    });

    describe("signed in", () => {
      beforeEach(signIn);

      it("publish: sets the status and dates, records what changed, returns to the same queue view", async () => {
        const to = await run(
          actions.saveOpportunity(
            form({
              ...fields("ready", {
                kind: "internship",
                deadlineKind: "fixed",
                deadlineAtDate: "2026-12-01",
              }),
              intent: "publish",
              note: "checked against the page",
            }),
          ),
        );
        expect(to).toBe("/admin?tab=all&q=acme");
        const r = await row("ready");
        expect(r).toMatchObject({
          status: "published",
          kind: "internship",
          deadlineKind: "fixed",
          extractionMethod: "manual",
        });
        expect(r.deadlineAt?.toISOString()).toBe("2026-12-01T22:59:00.000Z");
        expect(r.publishedAt).not.toBeNull();
        expect(r.reviewedAt).not.toBeNull();
        const [e] = await events("ready");
        expect(e).toMatchObject({
          actor: "admin",
          action: "published",
          note: "checked against the page",
        });
        expect(e?.changes).toMatchObject({
          kind: { from: "job", to: "internship" },
          status: { from: "review", to: "published" },
          deadlineAt: { from: null, to: "2026-12-01T22:59:00.000Z" },
        });
        // The public pages are told to refresh.
        expect(revalidated).toEqual(["/"]);
      });

      it("publish with no edits keeps how the row was extracted", async () => {
        await run(actions.saveOpportunity(form({ ...fields("ready"), intent: "publish" })));
        expect(await row("ready")).toMatchObject({
          status: "published",
          extractionMethod: "rules",
        });
        expect((await events("ready"))[0]?.changes).toEqual({
          status: { from: "review", to: "published" },
        });
      });

      it("cannot publish without a kind and a location, and says so", async () => {
        const to = await run(
          actions.saveOpportunity(
            form({ ...fields("draft", { kind: "", locationMode: "" }), intent: "publish" }),
          ),
        );
        expect(to).toContain(`/admin/o/${ids.draft}?back=`);
        expect(decodeURIComponent(to)).toContain("error=Kind: choose one before publishing");
        expect((await row("draft")).status).toBe("review");
        expect(await events("draft")).toEqual([]);
      });

      it("save without publishing keeps the status and stays on the item", async () => {
        const to = await run(
          actions.saveOpportunity(
            form({
              ...fields("draft", { kind: "", locationMode: "", title: "A better title" }),
              intent: "save",
            }),
          ),
        );
        expect(to).toBe(
          `/admin/o/${ids.draft}?back=${encodeURIComponent("/admin?tab=all&q=acme")}&saved=1`,
        );
        expect(await row("draft")).toMatchObject({
          status: "review",
          title: "A better title",
          publishedAt: null,
        });
        expect((await events("draft")).map((e) => e.action)).toEqual(["edited"]);
      });

      it("saving with nothing changed writes nothing", async () => {
        const before = await row("live");
        await run(actions.saveOpportunity(form({ ...fields("live"), intent: "publish" })));
        expect((await row("live")).updatedAt).toEqual(before.updatedAt);
        expect(await events("live")).toEqual([]);
        expect(revalidated).toEqual([]);
      });

      it("an invalid form is refused with its reason and nothing is written", async () => {
        const to = await run(
          actions.saveOpportunity(
            form({ ...fields("ready", { deadlineAtDate: "2026-12-01" }), intent: "publish" }),
          ),
        );
        expect(decodeURIComponent(to)).toContain(
          'error=Deadline: a "unknown" deadline has no date',
        );
        expect((await row("ready")).status).toBe("review");
      });

      it("reject: needs review status and a reason, keeps both, ignores other edits", async () => {
        // No reason chosen: refused, nothing written.
        const refused = await run(
          actions.saveOpportunity(form({ ...fields("ready"), intent: "reject" })),
        );
        expect(refused).toContain("error=Choose%20why");
        expect((await row("ready")).status).toBe("review");

        await run(
          actions.saveOpportunity(
            form({
              ...fields("ready", { title: "ignored" }),
              intent: "reject",
              reason: "not-an-opportunity",
              note: "a news post",
            }),
          ),
        );
        expect(await row("ready")).toMatchObject({
          status: "rejected",
          statusReason: "not-an-opportunity: a news post",
          title: "Title ready",
        });
        expect((await events("ready"))[0]).toMatchObject({
          action: "rejected",
          changes: { reason: { from: null, to: "not-an-opportunity" } },
          note: "a news post",
        });
        // A published item cannot be rejected, only unpublished.
        await run(actions.saveOpportunity(form({ ...fields("live"), intent: "reject" })));
        expect((await row("live")).status).toBe("published");
      });

      it("a copy the engine flagged: merge keeps the earlier, split frees this one", async () => {
        const orig = await opp(su, {
          organizationId: orgId,
          slug: "orig",
          title: "Original",
          status: "published",
        });
        const copy = async (slug: string) => {
          const o = await opp(su, {
            organizationId: orgId,
            slug,
            title: `Title ${slug}`,
            status: "review",
            duplicateOfId: orig.id,
          });
          ids[slug] = o.id;
        };
        await copy("copy-a");
        await copy("copy-b");
        const back = "/admin?tab=review";

        await run(
          actions.markDuplicate(form({ id: ids["copy-a"] as string, originalId: orig.id, back })),
        );
        expect(await row("copy-a")).toMatchObject({ status: "rejected", duplicateOfId: orig.id });
        expect((await row("orig")).status).toBe("published");

        await run(actions.splitDuplicate(form({ id: ids["copy-b"] as string, back })));
        expect(await row("copy-b")).toMatchObject({ status: "review", duplicateOfId: null });
        expect((await events("copy-b"))[0]).toMatchObject({
          action: "edited",
          changes: { duplicateOf: { from: "orig", to: null } },
        });
        // Split only applies to a flagged item still in review.
        await run(actions.splitDuplicate(form({ id: ids["copy-a"] as string, back })));
        expect((await row("copy-a")).duplicateOfId).toBe(orig.id);
      });

      it("unpublish takes a published item back to review", async () => {
        await run(
          actions.saveOpportunity(
            form({ ...fields("live"), intent: "unpublish", note: "wrong deadline" }),
          ),
        );
        expect(await row("live")).toMatchObject({
          status: "review",
          statusReason: "wrong deadline",
        });
        expect((await events("live"))[0]).toMatchObject({
          action: "unpublished",
          changes: { status: { from: "published", to: "review" } },
        });
        expect(revalidated).toEqual(["/"]);
      });

      it("publish and next opens the next item to review, least sure first, then the queue", async () => {
        const first = await run(
          actions.saveOpportunity(form({ ...fields("ready"), intent: "publishNext" })),
        );
        expect(first).toBe(
          `/admin/o/${ids.draft}?back=${encodeURIComponent("/admin?tab=all&q=acme")}`,
        );
        const last = await run(
          actions.saveOpportunity(form({ ...fields("draft"), intent: "publishNext" })),
        );
        expect(last).toBe("/admin?tab=all&q=acme");
      });

      it("a reviewed item whose source moved its deadline: listed for review, still live, cleared on save", async () => {
        const { listQueue, tabCounts } = await import("../../src/admin/data");
        await su.opportunity.update({
          where: { id: ids.live },
          data: { sourceDeadlineAt: new Date("2026-12-10T22:59:00.000Z") },
        });
        const queue = await listQueue({ tab: "review", page: 1 });
        expect(queue.rows.map((r) => r.slug)).toContain("live");
        expect((await tabCounts()).review).toBe(3);
        expect((await row("live")).status).toBe("published");

        await run(
          actions.saveOpportunity(form({ ...fields("live"), intent: "publish", note: "checked" })),
        );
        const after = await row("live");
        expect(after).toMatchObject({ status: "published", sourceDeadlineAt: null });
        expect((await events("live"))[0]).toMatchObject({
          action: "edited",
          changes: { sourceDeadlineAt: { from: "2026-12-10T22:59:00.000Z", to: null } },
          note: "checked",
        });
        expect((await listQueue({ tab: "review", page: 1 })).rows.map((r) => r.slug)).not.toContain(
          "live",
        );
      });

      it("only ever returns to an admin path", async () => {
        const to = await run(
          actions.saveOpportunity(
            form({ ...fields("ready"), back: "https://evil.example/", intent: "publish" }),
          ),
        );
        expect(to).toBe("/admin");
      });
    });

    describe("what each role may do (grants.sql)", () => {
      it("admin can change opportunities and append history, and nothing more", async () => {
        const { adminDb } = await import("../../src/admin/db");
        const db = adminDb();
        await expect(db.opportunity.delete({ where: { id: ids.live } })).rejects.toThrow(
          /permission denied/,
        );
        await expect(
          db.organization.update({ where: { id: orgId }, data: { name: "x" } }),
        ).rejects.toThrow(/permission denied/);
        await db.opportunityEvent.create({
          data: {
            opportunityId: ids.live as string,
            actor: "admin",
            action: "edited",
            changes: {},
          },
        });
        // History is append-only, even for admin.
        await expect(db.opportunityEvent.deleteMany()).rejects.toThrow(/permission denied/);
        await expect(
          db.opportunityEvent.updateMany({ data: { note: "rewritten" } }),
        ).rejects.toThrow(/permission denied/);
      });

      it.skipIf(!webUrl)(
        "the public web role cannot read the history or write anything",
        async () => {
          const { createClient } = await import("@devspot/db");
          const web = createClient(webUrl ?? "");
          try {
            await expect(web.opportunityEvent.count()).rejects.toThrow(/permission denied/);
            await expect(
              web.opportunity.update({ where: { id: ids.live }, data: { title: "x" } }),
            ).rejects.toThrow(/permission denied/);
          } finally {
            await web.$disconnect();
          }
        },
      );
    });
  },
);
