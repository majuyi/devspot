import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PrismaClient } from "@devspot/db";
import {
  ApiError,
  MetaDto,
  OpportunityDto,
  OpportunityPage,
  OrganizationDto,
  OrganizationPage,
} from "@devspot/schema";
import { Validator } from "@seriousme/openapi-schema-validator";
import { beforeAll, describe, expect, it } from "vitest";
import { openapiDocument } from "../../src/api/openapi";
import { at, hasDb, opp, org, reset } from "../seed";

const BASE = "https://devspot.test/api/v1";
let ip = 0;
/** Each request from its own address, so only the rate-limit test meets the limit. */
const get = (path: string, from = `10.0.0.${++ip % 250}`) =>
  new Request(`${BASE}${path}`, { headers: { "x-forwarded-for": from } });
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("OpenAPI document", () => {
  it("validates as OpenAPI 3.1", async () => {
    const result = await new Validator().validate(JSON.parse(JSON.stringify(openapiDocument())));
    expect(result.errors).toBeUndefined();
    expect(result.valid).toBe(true);
  });

  it("matches the committed docs/schema/openapi.json (run pnpm --filter @devspot/web openapi:emit)", () => {
    const committed = readFileSync(
      resolve(import.meta.dirname, "../../../../docs/schema/openapi.json"),
      "utf8",
    );
    expect(JSON.parse(committed)).toEqual(JSON.parse(JSON.stringify(openapiDocument())));
  });

  it("is served with CORS and CDN caching, and answers OPTIONS", async () => {
    const route = await import("../../src/app/api/v1/openapi.json/route");
    const res = await route.GET(get("/openapi.json"));
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=900, stale-while-revalidate=3600",
    );
    expect(res.headers.get("x-ratelimit-limit")).toBe("60");
    const pre = route.OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });

  it("answers the 61st request in a minute from one address with 429 and Retry-After", async () => {
    const route = await import("../../src/app/api/v1/openapi.json/route");
    const from = "192.0.2.1";
    for (let i = 0; i < 60; i++)
      expect((await route.GET(get("/openapi.json", from))).status).toBe(200);
    const res = await route.GET(get("/openapi.json", from));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(res.headers.get("x-ratelimit-remaining")).toBe("0");
    expect(ApiError.parse(await res.json()).error.code).toBe("rate_limited");
    expect((await route.GET(get("/openapi.json", "192.0.2.2"))).status).toBe(200);
  });
});

describe.skipIf(!hasDb)("v1 route handlers", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    ({ db } = await import("@devspot/db"));
    await reset(db);
    const gdg = await org(db, { slug: "gdg-lagos", category: "community", city: "lagos" });
    const devpost = await org(db, { slug: "devpost", category: "hackathonHost", country: "US" });
    await org(db, { slug: "gone", enabled: false });
    await db.source.create({
      data: {
        organizationId: gdg.id,
        key: "gdg-lagos/events",
        kind: "api",
        url: "https://gdg.example",
      },
    });
    const lagosEvent = {
      organizationId: gdg.id,
      kind: "event",
      locationMode: "onsite",
      country: "NG",
    } as const;
    await opp(db, {
      ...lagosEvent,
      slug: "devfest-lagos",
      title: "DevFest Lagos",
      city: "lagos",
      startsAt: at(48),
      publishedAt: at(-24),
    });
    await opp(db, {
      ...lagosEvent,
      slug: "devfest-ibadan",
      title: "DevFest Ibadan",
      city: "ibadan",
      startsAt: at(72),
      publishedAt: at(-24),
    });
    await opp(db, {
      organizationId: devpost.id,
      slug: "online-meetup",
      title: "Online meetup",
      kind: "event",
      startsAt: at(96),
      publishedAt: at(-2),
    });
    await opp(db, {
      organizationId: devpost.id,
      slug: "hack",
      title: "A hackathon",
      deadlineAt: at(100),
      publishedAt: at(-3),
    });
    await opp(db, {
      organizationId: devpost.id,
      slug: "secret",
      title: "In review",
      status: "review",
    });
  });

  const body = async (res: Response) => {
    expect(res.headers.get("content-type")).toContain("application/json");
    return res.json();
  };

  it("GET /opportunities returns a valid page; city=lagos&kinds=event only Lagos or remote events", async () => {
    const { GET } = await import("../../src/app/api/v1/opportunities/route");
    const all = OpportunityPage.parse(await body(await GET(get("/opportunities"))));
    expect(all.items.map((o) => o.slug)).not.toContain("secret");
    const res = await GET(get("/opportunities?city=lagos&kinds=event"));
    const page = OpportunityPage.parse(await body(res));
    expect(new Set(page.items.map((o) => o.slug))).toEqual(
      new Set(["devfest-lagos", "online-meetup"]),
    );
    for (const o of page.items) {
      expect(o.kind).toBe("event");
      expect(o.locationMode === "remote" || o.city === "lagos").toBe(true);
    }
  });

  it("GET /opportunities pages with nextCursor and rejects bad input with 400", async () => {
    const { GET } = await import("../../src/app/api/v1/opportunities/route");
    const first = OpportunityPage.parse(await body(await GET(get("/opportunities?limit=2"))));
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = OpportunityPage.parse(
      await body(await GET(get(`/opportunities?limit=2&cursor=${first.nextCursor}`))),
    );
    expect(second.items.map((o) => o.slug)).not.toContain(first.items[0]?.slug);
    for (const q of ["limit=101", "kinds=spaceship", "cursor=nope", "city=london"]) {
      const res = await GET(get(`/opportunities?${q}`));
      expect(res.status, q).toBe(400);
      expect(ApiError.parse(await res.json()).error.code).toBe("bad_request");
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("GET /opportunities/{slug}: a published one, and a 404 for review or unknown", async () => {
    const { GET } = await import("../../src/app/api/v1/opportunities/[slug]/route");
    const ok = await GET(get("/opportunities/hack"), ctx("hack"));
    expect(OpportunityDto.parse(await body(ok)).slug).toBe("hack");
    for (const slug of ["secret", "nothing"]) {
      const res = await GET(get(`/opportunities/${slug}`), ctx(slug));
      expect(res.status).toBe(404);
      expect(ApiError.parse(await res.json()).error.code).toBe("not_found");
    }
  });

  it("GET /events: upcoming by start, with a date-only from and to read in Lagos", async () => {
    const { GET } = await import("../../src/app/api/v1/events/route");
    const page = OpportunityPage.parse(await body(await GET(get("/events?from=2026-01-01"))));
    expect(page.items.map((o) => o.slug).slice(0, 3)).toEqual([
      "devfest-lagos",
      "devfest-ibadan",
      "online-meetup",
    ]);
    const lagos = OpportunityPage.parse(
      await body(await GET(get("/events?from=2026-01-01&city=lagos"))),
    );
    expect(lagos.items.map((o) => o.slug)).toEqual(["devfest-lagos", "online-meetup"]);
    expect((await GET(get("/events?from=yesterday"))).status).toBe(400);
  });

  it("GET /organizations and /organizations/{slug}: enabled only, valid DTOs", async () => {
    const list = await import("../../src/app/api/v1/organizations/route");
    const page = OrganizationPage.parse(await body(await list.GET(get("/organizations"))));
    expect(page.items.map((o) => o.slug)).toEqual(["devpost", "gdg-lagos"]);
    const one = await import("../../src/app/api/v1/organizations/[slug]/route");
    const gdg = OrganizationDto.parse(
      await body(await one.GET(get("/organizations/gdg-lagos"), ctx("gdg-lagos"))),
    );
    expect(gdg.openCount).toBe(2);
    expect(gdg.sources.map((s) => s.key)).toEqual(["gdg-lagos/events"]);
    expect((await one.GET(get("/organizations/gone"), ctx("gone"))).status).toBe(404);
  });

  it("GET /organizations/{slug}/opportunities: that organization's, and 404 for an unknown one", async () => {
    const { GET } = await import("../../src/app/api/v1/organizations/[slug]/opportunities/route");
    const page = OpportunityPage.parse(
      await body(await GET(get("/organizations/devpost/opportunities"), ctx("devpost"))),
    );
    expect(new Set(page.items.map((o) => o.slug))).toEqual(new Set(["online-meetup", "hack"]));
    expect((await GET(get("/organizations/gone/opportunities"), ctx("gone"))).status).toBe(404);
  });

  it("GET /meta: valid, with live counts", async () => {
    const { GET } = await import("../../src/app/api/v1/meta/route");
    const meta = MetaDto.parse(await body(await GET(get("/meta"))));
    expect(meta.counts).toEqual({ organizations: 2, sources: 1, openOpportunities: 4 });
  });
});
