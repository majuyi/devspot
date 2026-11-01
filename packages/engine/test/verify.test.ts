import { resolve } from "node:path";
import type { PrismaClient } from "@devspot/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HttpClient, HttpResponse } from "../src/http.js";
import { RobotsDisallowed } from "../src/http.js";
import { dueForVerify, type VerifyTarget, verify, verifyPublished } from "../src/verify.js";

// Needs the Docker database, as test/raw-items.test.ts does.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../../../.env"));
  } catch {}
}
const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb && process.env.CI) throw new Error("DATABASE_URL must be set in CI");

const NOW = new Date("2026-11-01T12:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

const target = (extra: Partial<VerifyTarget> = {}): VerifyTarget => ({
  canonicalUrl: "https://example.org/x",
  kind: "internship",
  deadlineAt: null,
  startsAt: null,
  endsAt: null,
  ...extra,
});
const page = (status: number, body = "<p>Apply now.</p>"): Pick<HttpClient, "get"> => ({
  get: async () => ({ url: "", status, headers: {}, body }) as HttpResponse,
});
const noRequest: Pick<HttpClient, "get"> = {
  get: async () => {
    throw new Error("no request expected");
  },
};

describe("verify", () => {
  it("invariant 7: past the deadline by over 24 hours closes, with no request", async () => {
    expect(await verify(target({ deadlineAt: ago(25) }), noRequest, NOW)).toEqual({
      outcome: "closed",
      reason: "date-passed",
    });
  });

  it("invariant 7: an event closes on endsAt, not on its registration deadline", async () => {
    const event = target({ kind: "event", deadlineAt: ago(100), endsAt: ago(-5) });
    expect((await verify(event, page(200), NOW)).outcome).toBe("verified");
    const over = target({ kind: "event", deadlineAt: ago(100), endsAt: ago(25) });
    expect((await verify(over, noRequest, NOW)).outcome).toBe("closed");
  });

  it("an event with one date closes on it", async () => {
    const event = target({ kind: "event", startsAt: ago(25) });
    expect((await verify(event, noRequest, NOW)).outcome).toBe("closed");
  });

  it("a date under 24 hours past still gets a request", async () => {
    expect((await verify(target({ deadlineAt: ago(23) }), page(200), NOW)).outcome).toBe(
      "verified",
    );
  });

  it.each([404, 410])("closes on %i", async (status) => {
    expect(await verify(target(), page(status), NOW)).toEqual({
      outcome: "closed",
      reason: `http-${status}`,
    });
  });

  it.each([
    "<p>Applications  are\nclosed.</p>",
    "<h2>REGISTRATION HAS ENDED</h2>",
    "<div>We are no longer accepting entries</div>",
  ])("closes on the notice in %j", async (body) => {
    expect((await verify(target(), page(200, body), NOW)).outcome).toBe("closed");
  });

  it("ignores a notice that is only in a script", async () => {
    const body = "<script>var m = 'applications are closed'</script><p>Open.</p>";
    expect((await verify(target(), page(200, body), NOW)).outcome).toBe("verified");
  });

  it.each([403, 500, 503])("treats %i as unreachable, which changes nothing", async (status) => {
    expect(await verify(target(), page(status), NOW)).toEqual({
      outcome: "unreachable",
      error: `HTTP ${status}`,
    });
  });

  it("treats a robots refusal as unreachable and asks for any type", async () => {
    let headers: Record<string, string> | undefined;
    const http: Pick<HttpClient, "get"> = {
      get: async (_url, h) => {
        headers = h;
        throw new RobotsDisallowed("https://example.org/x");
      },
    };
    expect(await verify(target(), http, NOW)).toEqual({
      outcome: "unreachable",
      error: "RobotsDisallowed",
    });
    expect(headers).toEqual({ accept: "*/*" });
  });
});

describe.skipIf(!hasDb)("verifyPublished against Postgres", () => {
  let db: PrismaClient;
  let organizationId: string;
  const slug = `test-verify-${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    const org = await db.organization.create({
      data: {
        slug,
        name: "Verify test",
        category: "community",
        homepageUrl: "https://example.org",
        country: "NG",
        registryHash: "test",
      },
    });
    organizationId = org.id;
  });
  beforeEach(() => db.opportunity.deleteMany({ where: { organizationId } }));
  afterAll(async () => {
    await db?.opportunity.deleteMany({ where: { organizationId } });
    await db?.organization.deleteMany({ where: { slug } });
    await db?.$disconnect();
  });

  const add = (name: string, extra: Record<string, unknown> = {}) =>
    db.opportunity.create({
      data: {
        slug: `${slug}-${name}`,
        organizationId,
        title: name,
        kind: "internship",
        canonicalUrl: `https://example.org/${slug}/${name}`,
        locationMode: "remote",
        confidence: 0.9,
        extractionMethod: "rules",
        discoveredVia: "html",
        identityKey: `${slug}-${name}`,
        status: "published",
        lastVerifiedAt: ago(1),
        ...extra,
      },
    });
  const httpFor = (byName: Record<string, number>) =>
    ({
      get: async (url: string) => ({
        url,
        status: byName[url.split("/").pop() ?? ""] ?? 200,
        headers: {},
        body: "<p>Open</p>",
      }),
    }) as unknown as HttpClient;
  const statusOf = async (id: string) => db.opportunity.findUniqueOrThrow({ where: { id } });
  const due = async () =>
    (await db.opportunity.findMany({ where: { organizationId, ...dueForVerify(NOW) } }))
      .map((o) => o.title)
      .sort();

  it("picks the rows docs/04 names, and any past date", async () => {
    await add("soon", { deadlineAt: ago(-71) });
    await add("later", { deadlineAt: ago(-73) });
    await add("just-passed", { deadlineAt: ago(5) });
    await add("long-passed", { deadlineAt: ago(24 * 60) });
    await add("event-over", { kind: "event", startsAt: ago(30) });
    await add("programme-started", { startsAt: ago(30) });
    await add("ended", { endsAt: ago(30) });
    await add("old-check", { lastVerifiedAt: ago(24 * 8) });
    await add("recent-check", { lastVerifiedAt: ago(24 * 6) });
    await add("never-checked", { lastVerifiedAt: null });
    await add("in-review", { status: "review", lastVerifiedAt: null });
    expect(await due()).toEqual(
      [
        "soon",
        "just-passed",
        "long-passed",
        "event-over",
        "ended",
        "old-check",
        "never-checked",
      ].sort(),
    );
  });

  it("closes, verifies, or leaves each row, and --all ignores what is due", async () => {
    const gone = await add("gone", { lastVerifiedAt: null });
    const fine = await add("fine", { lastVerifiedAt: null });
    const down = await add("down", { lastVerifiedAt: null });
    const quiet = await add("quiet");
    const http = httpFor({ gone: 404, down: 500 });

    const summary = await verifyPublished(db, http, { now: NOW });
    expect(summary).toEqual({ checked: 3, verified: 1, closed: 1, unreachable: 1 });
    expect(await statusOf(gone.id)).toMatchObject({
      status: "closed",
      statusReason: "http-404",
      closedAt: NOW,
      lastVerifiedAt: NOW,
    });
    expect(await statusOf(fine.id)).toMatchObject({ status: "published", lastVerifiedAt: NOW });
    expect(await statusOf(down.id)).toMatchObject({ status: "published", lastVerifiedAt: null });
    expect((await statusOf(quiet.id)).lastVerifiedAt).toEqual(ago(1));

    await verifyPublished(db, http, { all: true, now: NOW });
    expect((await statusOf(quiet.id)).lastVerifiedAt).toEqual(NOW);
  });

  it("carries on when a row disappears mid-pass", async () => {
    const row = await add("removed", { lastVerifiedAt: null });
    const http = {
      get: async () => {
        await db.opportunity.delete({ where: { id: row.id } });
        return { url: "", status: 404, headers: {}, body: "" };
      },
    } as unknown as HttpClient;
    await expect(verifyPublished(db, http, { now: NOW })).resolves.toMatchObject({ checked: 1 });
  });

  it("leaves a row a reviewer pulled from the site mid-pass", async () => {
    const row = await add("pulled", { lastVerifiedAt: null });
    const http = {
      get: async () => {
        await db.opportunity.update({ where: { id: row.id }, data: { status: "review" } });
        return { url: "", status: 404, headers: {}, body: "" };
      },
    } as unknown as HttpClient;
    await verifyPublished(db, http, { now: NOW });
    expect(await statusOf(row.id)).toMatchObject({ status: "review", closedAt: null });
  });

  it("never reopens a closed row", async () => {
    const closed = await add("closed", {
      status: "closed",
      closedAt: ago(5),
      lastVerifiedAt: null,
    });
    await verifyPublished(db, httpFor({}), { all: true, now: NOW });
    expect(await statusOf(closed.id)).toMatchObject({ status: "closed", closedAt: ago(5) });
  });
});
